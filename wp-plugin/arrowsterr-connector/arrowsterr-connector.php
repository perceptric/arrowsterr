<?php
/**
 * Plugin Name:       Arrowsterr Connector
 * Plugin URI:        https://arrowsterr.com/
 * Description:       Lets Arrowsterr publish articles with their interactive modules, set SEO titles, meta descriptions and structured data on your posts and pages, serve llms.txt, tell Bing and other search engines about changed pages with IndexNow, and count which pages AI crawlers read. Works with Yoast SEO and Rank Math, or on its own.
 * Version:           1.3.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Arrowsterr
 * License:           GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
	exit;
}

define('ARROWSTERR_CONNECTOR_VERSION', '1.3.0');
// The largest llms.txt Arrowsterr stores, in bytes.
define('ARROWSTERR_LLMS_MAX', 200000);
// The largest module Arrowsterr stores, in bytes. Modules are single HTML files with inline CSS and JS.
define('ARROWSTERR_MODULE_MAX', 500000);

/** The SEO plugin that owns titles and descriptions on this site, if any. */
function arrowsterr_seo_plugin() {
	if (defined('WPSEO_VERSION')) {
		return 'yoast';
	}
	if (defined('RANK_MATH_VERSION')) {
		return 'rankmath';
	}
	return 'none';
}

/** Where each value is stored, so edits show up in the SEO plugin people already use. */
function arrowsterr_keys() {
	switch (arrowsterr_seo_plugin()) {
		case 'yoast':
			return array('title' => '_yoast_wpseo_title', 'description' => '_yoast_wpseo_metadesc');
		case 'rankmath':
			return array('title' => 'rank_math_title', 'description' => 'rank_math_description');
		default:
			return array('title' => '_arrowsterr_title', 'description' => '_arrowsterr_description');
	}
}

// ─────────────── Interactive modules ───────────────
// Each module is stored in the post's meta (_arrowsterr_modules: id => title, html, height) and shown with
// [arrowsterr_module id="..."] or the Arrowsterr module block. It always runs in a sandboxed iframe
// (sandbox="allow-scripts", no same origin), so its scripts can't reach this site, its cookies or the page around it.

/** A module id: 1 to 64 letters, digits, - or _. */
function arrowsterr_module_id($id) {
	$id = (string) $id;
	return preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) ? $id : '';
}

/** Clean one module sent by Arrowsterr. Null when it is not a valid module. */
function arrowsterr_clean_module($m) {
	if (!is_array($m)) {
		return null;
	}
	$id   = arrowsterr_module_id(isset($m['id']) ? $m['id'] : '');
	$html = isset($m['html']) ? (string) $m['html'] : '';
	if ($id === '' || $html === '' || strlen($html) > ARROWSTERR_MODULE_MAX) {
		return null;
	}
	// Valid UTF-8 only, and no null bytes.
	$html = str_replace("\0", '', wp_check_invalid_utf8($html));
	if ($html === '') {
		return null;
	}
	$height = isset($m['height']) ? (int) $m['height'] : 600;
	return array(
		'id'     => $id,
		'title'  => sanitize_text_field(isset($m['title']) ? (string) $m['title'] : ''),
		'html'   => $html,
		'height' => max(100, min(4000, $height)),
	);
}

/** The modules saved on a post, by id. */
function arrowsterr_post_modules($post_id) {
	$all = get_post_meta((int) $post_id, '_arrowsterr_modules', true);
	return is_array($all) ? $all : array();
}

/** The page a module runs in: its HTML and a small script that reports its height to this page. */
function arrowsterr_module_document($html) {
	$fit = '<script>(function(){function s(){parent.postMessage({awh:document.documentElement.scrollHeight},"*")}new ResizeObserver(s).observe(document.documentElement);addEventListener("load",s)})()</script>';
	if (stripos($html, '</body>') !== false) {
		return preg_replace('~</body>~i', $fit . '</body>', $html, 1);
	}
	return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0">' . $html . $fit . '</body>';
}

/** One module as a sandboxed iframe that sizes itself. Empty when the post has no such module. */
function arrowsterr_render_module($post_id, $id) {
	$id = arrowsterr_module_id($id);
	if ($id === '' || !$post_id) {
		return '';
	}
	$modules = arrowsterr_post_modules($post_id);
	if (!isset($modules[$id]) || !is_array($modules[$id]) || empty($modules[$id]['html'])) {
		return '';
	}
	$m = $modules[$id];
	arrowsterr_enqueue_resizer();
	// srcdoc is an attribute: every &, quote and angle bracket is encoded, including entities already in the HTML,
	// so the module arrives in its frame exactly as written and nothing can close the attribute or the tag.
	$doc    = htmlspecialchars(arrowsterr_module_document((string) $m['html']), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', true);
	$height = isset($m['height']) ? max(100, min(4000, (int) $m['height'])) : 600;
	$title  = !empty($m['title']) ? $m['title'] : __('Interactive module', 'arrowsterr-connector');
	return '<div class="arrowsterr-module"><iframe class="arrowsterr-module__frame" title="' . esc_attr($title) . '" sandbox="allow-scripts" loading="lazy" style="display:block;width:100%;border:0;height:' . $height . 'px" srcdoc="' . $doc . '"></iframe></div>';
}

/** The script that sets each module frame's height from the message its page sends. Once per page. */
function arrowsterr_enqueue_resizer() {
	if (wp_script_is('arrowsterr-modules', 'enqueued')) {
		return;
	}
	wp_register_script('arrowsterr-modules', false, array(), ARROWSTERR_CONNECTOR_VERSION, true);
	wp_enqueue_script('arrowsterr-modules');
	wp_add_inline_script('arrowsterr-modules', '(function(){addEventListener("message",function(e){if(!e.data||typeof e.data.awh!=="number")return;var f=document.querySelectorAll("iframe.arrowsterr-module__frame");for(var i=0;i<f.length;i++){if(f[i].contentWindow===e.source){f[i].style.height=Math.min(4000,Math.max(100,Math.ceil(e.data.awh)+4))+"px";}}});})();');
}

add_shortcode('arrowsterr_module', function ($atts) {
	$atts = shortcode_atts(array('id' => ''), $atts, 'arrowsterr_module');
	return arrowsterr_render_module(get_the_ID(), $atts['id']);
});

add_action('init', function () {
	// The block for people adding a module by hand in the block editor. Arrowsterr itself publishes the shortcode.
	wp_register_script('arrowsterr-module-block', false, array('wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-server-side-render', 'wp-i18n'), ARROWSTERR_CONNECTOR_VERSION, true);
	wp_add_inline_script('arrowsterr-module-block', <<<'JS'
(function (wp) {
	var el = wp.element.createElement, __ = wp.i18n.__;
	wp.blocks.registerBlockType('arrowsterr/module', {
		apiVersion: 2,
		title: __('Arrowsterr module', 'arrowsterr-connector'),
		description: __('An interactive module published from Arrowsterr.', 'arrowsterr-connector'),
		category: 'embed',
		icon: 'calculator',
		attributes: { id: { type: 'string', default: '' } },
		supports: { html: false },
		edit: function (props) {
			var bp = wp.blockEditor.useBlockProps();
			return el('div', bp,
				el(wp.blockEditor.InspectorControls, null,
					el(wp.components.PanelBody, { title: __('Module', 'arrowsterr-connector') },
						el(wp.components.TextControl, { label: __('Module id', 'arrowsterr-connector'), value: props.attributes.id, onChange: function (v) { props.setAttributes({ id: v }); } }))),
				props.attributes.id
					? el(wp.serverSideRender, { block: 'arrowsterr/module', attributes: props.attributes })
					: el(wp.components.Placeholder, { icon: 'calculator', label: __('Arrowsterr module', 'arrowsterr-connector') },
						el(wp.components.TextControl, { label: __('Module id', 'arrowsterr-connector'), value: props.attributes.id, onChange: function (v) { props.setAttributes({ id: v }); } })));
		},
		save: function () { return null; }
	});
})(window.wp);
JS
	);
	register_block_type('arrowsterr/module', array(
		'api_version'     => 2,
		'editor_script'   => 'arrowsterr-module-block',
		'attributes'      => array('id' => array('type' => 'string', 'default' => '')),
		'render_callback' => function ($attributes) {
			return arrowsterr_render_module(get_the_ID(), isset($attributes['id']) ? $attributes['id'] : '');
		},
	));
});

// ─────────────── REST API ───────────────

add_action('rest_api_init', function () {
	// Arrowsterr checks this to know the plugin is installed, its version and which SEO plugin it writes through.
	register_rest_route('arrowsterr/v1', '/status', array(
		'methods'             => 'GET',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'callback'            => function () {
			return array('version' => ARROWSTERR_CONNECTOR_VERSION, 'seo' => arrowsterr_seo_plugin(), 'modules' => true, 'crawlers' => arrowsterr_crawls_on(), 'indexnow' => arrowsterr_indexnow_on() || arrowsterr_indexnow_other() !== '', 'indexnow_by' => arrowsterr_indexnow_on() ? 'arrowsterr' : arrowsterr_indexnow_other(), 'llms' => get_option('arrowsterr_llms', '') !== '', 'admin' => current_user_can('manage_options'));
		},
	));

	// Turn IndexNow on or off. Site-wide, so it needs an administrator.
	register_rest_route('arrowsterr/v1', '/indexnow', array(
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can('manage_options');
		},
		'callback'            => function (WP_REST_Request $request) {
			$on = (bool) $request->get_param('on');
			if ($on && !arrowsterr_indexnow_key()) {
				update_option('arrowsterr_indexnow_key', bin2hex(random_bytes(16)), true);
			}
			update_option('arrowsterr_indexnow', $on ? '1' : '', true);
			return array('indexnow' => arrowsterr_indexnow_on(), 'key_url' => $on ? home_url('/' . arrowsterr_indexnow_key() . '.txt') : null);
		},
	));

	// Save llms.txt, served at /llms.txt when the site has no file of its own. Empty text removes it.
	register_rest_route('arrowsterr/v1', '/llms', array(
		'methods'             => 'POST',
		'permission_callback' => function () {
			return current_user_can('manage_options');
		},
		'callback'            => function (WP_REST_Request $request) {
			$text = str_replace("\r\n", "\n", (string) $request->get_param('text'));
			if (strlen($text) > ARROWSTERR_LLMS_MAX) {
				return new WP_Error('arrowsterr_llms', 'llms.txt is too large.', array('status' => 400));
			}
			$text = wp_check_invalid_utf8($text);
			if (trim($text) === '') {
				delete_option('arrowsterr_llms');
			} else {
				update_option('arrowsterr_llms', $text, false);
			}
			return array('llms' => get_option('arrowsterr_llms', '') !== '', 'url' => home_url('/llms.txt'));
		},
	));

	// AI crawler counts for the last 1 to 90 days, and the site's key pages, for Arrowsterr's crawler report.
	register_rest_route('arrowsterr/v1', '/crawlers', array(
		'methods'             => 'GET',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'args'                => array('days' => array('type' => 'integer', 'default' => 30)),
		'callback'            => function (WP_REST_Request $request) {
			return arrowsterr_crawls_report((int) $request->get_param('days'));
		},
	));

	// The post Arrowsterr made for one of its articles, so a publish that was cut off never makes a second post.
	register_rest_route('arrowsterr/v1', '/find', array(
		'methods'             => 'GET',
		'permission_callback' => function () {
			return current_user_can('edit_posts');
		},
		'args'                => array('doc' => array('required' => true, 'type' => 'string')),
		'callback'            => function (WP_REST_Request $request) {
			$doc = strtolower((string) $request->get_param('doc'));
			if (!preg_match('/^[a-f0-9-]{36}$/', $doc)) {
				return new WP_Error('arrowsterr_doc', 'Not an article id.', array('status' => 400));
			}
			$ids = get_posts(array(
				'post_type'        => 'post',
				'post_status'      => array('publish', 'future', 'draft', 'pending', 'private', 'trash'),
				'meta_key'         => '_arrowsterr_doc',
				'meta_value'       => $doc,
				'orderby'          => 'ID',
				'order'            => 'DESC',
				'fields'           => 'ids',
				'posts_per_page'   => 10,
				'suppress_filters' => true,
			));
			foreach ($ids as $id) {
				if (current_user_can('edit_post', $id)) {
					return array('id' => (int) $id, 'status' => get_post_status($id));
				}
			}
			return array('id' => null);
		},
	));

	// Save the interactive modules of a post. The list replaces what the post had.
	register_rest_route('arrowsterr/v1', '/posts/(?P<id>\d+)/modules', array(
		array(
			'methods'             => 'POST',
			'permission_callback' => function (WP_REST_Request $request) {
				return current_user_can('edit_post', (int) $request['id']);
			},
			'callback'            => function (WP_REST_Request $request) {
				$post_id = (int) $request['id'];
				if (!get_post($post_id)) {
					return new WP_Error('rest_post_invalid_id', 'Invalid post ID.', array('status' => 404));
				}
				$list = $request->get_param('modules');
				if (!is_array($list) || count($list) > 50) {
					return new WP_Error('arrowsterr_modules', 'Send up to 50 modules.', array('status' => 400));
				}
				$clean = array();
				foreach ($list as $m) {
					$c = arrowsterr_clean_module($m);
					if (!$c) {
						return new WP_Error('arrowsterr_module', 'A module is missing its id or HTML, or is too large.', array('status' => 400));
					}
					$clean[$c['id']] = array('title' => $c['title'], 'html' => $c['html'], 'height' => $c['height']);
				}
				if (!$clean) {
					delete_post_meta($post_id, '_arrowsterr_modules');
				} else {
					update_post_meta($post_id, '_arrowsterr_modules', wp_slash($clean));
				}
				return array('id' => $post_id, 'modules' => array_keys($clean));
			},
		),
		array(
			'methods'             => 'GET',
			'permission_callback' => function (WP_REST_Request $request) {
				return current_user_can('edit_post', (int) $request['id']);
			},
			'callback'            => function (WP_REST_Request $request) {
				$out = array();
				foreach (arrowsterr_post_modules((int) $request['id']) as $id => $m) {
					$out[] = array('id' => (string) $id, 'title' => isset($m['title']) ? $m['title'] : '', 'height' => isset($m['height']) ? (int) $m['height'] : 600);
				}
				return $out;
			},
		),
	));

	foreach (array('post', 'page') as $type) {
		register_rest_field($type, 'arrowsterr', array(
			'get_callback'    => function ($post) {
				$id   = (int) $post['id'];
				$keys = arrowsterr_keys();
				return array(
					'title'       => (string) get_post_meta($id, $keys['title'], true),
					'description' => (string) get_post_meta($id, $keys['description'], true),
					'schema'      => (string) get_post_meta($id, '_arrowsterr_schema', true),
					'doc'         => (string) get_post_meta($id, '_arrowsterr_doc', true),
				);
			},
			'update_callback' => function ($value, $post) {
				if (!is_array($value) || !current_user_can('edit_post', $post->ID)) {
					return new WP_Error('arrowsterr_forbidden', 'You cannot edit this post.', array('status' => 403));
				}
				$keys = arrowsterr_keys();
				foreach (array('title', 'description') as $field) {
					if (!array_key_exists($field, $value)) {
						continue;
					}
					$text = sanitize_text_field((string) $value[$field]);
					if ($text === '') {
						delete_post_meta($post->ID, $keys[$field]);
					} else {
						update_post_meta($post->ID, $keys[$field], wp_slash($text));
					}
				}
				if (array_key_exists('schema', $value)) {
					$raw = trim((string) $value['schema']);
					if ($raw === '') {
						delete_post_meta($post->ID, '_arrowsterr_schema');
					} else {
						$data = json_decode($raw, true);
						if (!is_array($data)) {
							return new WP_Error('arrowsterr_schema', 'Structured data must be valid JSON.', array('status' => 400));
						}
						update_post_meta($post->ID, '_arrowsterr_schema', wp_slash(wp_json_encode($data, JSON_UNESCAPED_UNICODE)));
					}
				}
				// The Arrowsterr article this post was made from (find, above).
				if (array_key_exists('doc', $value)) {
					$doc = strtolower((string) $value['doc']);
					if (preg_match('/^[a-f0-9-]{36}$/', $doc)) {
						update_post_meta($post->ID, '_arrowsterr_doc', $doc);
					}
				}
				return true;
			},
			'schema'          => array(
				'description' => 'SEO title, meta description and structured data set by Arrowsterr, and the Arrowsterr article the post came from.',
				'type'        => 'object',
				'context'     => array('edit'),
			),
		));
	}
});

// With Yoast or Rank Math, they print the title and description. On their own, this plugin does.
add_filter('pre_get_document_title', function ($title) {
	if (arrowsterr_seo_plugin() !== 'none' || !is_singular()) {
		return $title;
	}
	$custom = get_post_meta(get_queried_object_id(), '_arrowsterr_title', true);
	return $custom !== '' ? $custom : $title;
}, 20);

add_action('wp_head', function () {
	if (!is_singular()) {
		return;
	}
	$id = get_queried_object_id();
	if (arrowsterr_seo_plugin() === 'none') {
		$description = get_post_meta($id, '_arrowsterr_description', true);
		if ($description !== '') {
			echo '<meta name="description" content="' . esc_attr($description) . '" />' . "\n";
		}
	}
	$schema = get_post_meta($id, '_arrowsterr_schema', true);
	if ($schema !== '') {
		$data = json_decode($schema, true);
		if (is_array($data)) {
			// wp_json_encode escapes slashes, so the JSON can't close the script tag.
			echo '<script type="application/ld+json">' . wp_json_encode($data) . '</script>' . "\n";
		}
	}
}, 5);

// ─────────────── IndexNow and llms.txt ───────────────
// IndexNow: a key file at /<key>.txt proves the site owns the key, and every published or updated post or page is
// sent to api.indexnow.org, which shares it with Bing, Yandex, Naver, Seznam and the others. Sent once per request,
// after the page is done, without waiting for an answer.

function arrowsterr_indexnow_key() {
	$key = (string) get_option('arrowsterr_indexnow_key', '');
	return preg_match('/^[a-f0-9]{32}$/', $key) ? $key : '';
}

function arrowsterr_indexnow_on() {
	return get_option('arrowsterr_indexnow', '') === '1' && arrowsterr_indexnow_key() !== '';
}

/** Another plugin that already sends IndexNow: Rank Math's Instant Indexing module. */
function arrowsterr_indexnow_other() {
	$rm = get_option('rank_math_modules', array());
	if (defined('RANK_MATH_VERSION') && is_array($rm) && in_array('instant-indexing', $rm, true)) {
		return 'rankmath';
	}
	return '';
}

/** The path this request asks for, relative to the site's home. */
function arrowsterr_request_path() {
	$path = (string) wp_parse_url(isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '', PHP_URL_PATH);
	$home = rtrim((string) wp_parse_url(home_url('/'), PHP_URL_PATH), '/');
	if ($home !== '' && strpos($path, $home) === 0) {
		$path = substr($path, strlen($home));
	}
	return $path;
}

// Serve the key file and llms.txt before WordPress looks for a post. A real file on the server wins, since the
// web server answers for it without calling WordPress.
add_action('init', function () {
	$path = arrowsterr_request_path();
	$key  = arrowsterr_indexnow_key();
	if ($key !== '' && arrowsterr_indexnow_on() && $path === '/' . $key . '.txt') {
		header('Content-Type: text/plain; charset=utf-8');
		echo $key; // phpcs:ignore WordPress.Security.EscapeOutput -- 32 hex characters.
		exit;
	}
	if ($path === '/llms.txt') {
		$text = (string) get_option('arrowsterr_llms', '');
		if ($text !== '') {
			header('Content-Type: text/plain; charset=utf-8');
			header('X-Robots-Tag: noindex');
			echo $text; // phpcs:ignore WordPress.Security.EscapeOutput -- plain text, served as text/plain.
			exit;
		}
	}
}, 0);

$GLOBALS['arrowsterr_indexnow_queue'] = array();

add_action('transition_post_status', function ($new_status, $old_status, $post) {
	if ($new_status !== 'publish' || !arrowsterr_indexnow_on() || wp_is_post_revision($post) || wp_is_post_autosave($post) || $post->post_password !== '') {
		return;
	}
	$type = get_post_type_object($post->post_type);
	if (!$type || !$type->public) {
		return;
	}
	$url = get_permalink($post);
	if ($url) {
		$GLOBALS['arrowsterr_indexnow_queue'][$url] = true;
	}
}, 10, 3);

add_action('shutdown', function () {
	$urls = array_keys($GLOBALS['arrowsterr_indexnow_queue']);
	if (!$urls || !arrowsterr_indexnow_on()) {
		return;
	}
	$key = arrowsterr_indexnow_key();
	wp_remote_post('https://api.indexnow.org/indexnow', array(
		'blocking' => false,
		'timeout'  => 3,
		'headers'  => array('Content-Type' => 'application/json; charset=utf-8'),
		'body'     => wp_json_encode(array(
			'host'        => (string) wp_parse_url(home_url('/'), PHP_URL_HOST),
			'key'         => $key,
			'keyLocation' => home_url('/' . $key . '.txt'),
			'urlList'     => array_slice($urls, 0, 100),
		)),
	));
});

// ─────────────── AI crawlers ───────────────
// Counts the pages AI crawlers read: one row per day, bot and path, in a small table. No IP addresses or other
// details are kept. Rows older than 90 days are removed, and once the table holds 20,000 rows only pages already
// in it keep counting, so it stays at a few megabytes. Pages served by a page cache never reach WordPress, so
// they are not counted here. Turn it off with: add_filter('arrowsterr_log_crawlers', '__return_false');

define('ARROWSTERR_CRAWLS_DB', '1');
define('ARROWSTERR_CRAWLS_DAYS', 90);
define('ARROWSTERR_CRAWLS_MAX_ROWS', 20000);

/**
 * The bots counted, by a word in their user agent, checked in this order without case.
 * Keep in step with BOTS in Arrowsterr's src/lib/aiCrawlers.ts (a test there checks both lists match).
 */
function arrowsterr_crawler_bots() {
	return array(
		'oai-searchbot'      => 'OAI-SearchBot',
		'chatgpt-user'       => 'ChatGPT-User',
		'gptbot'             => 'GPTBot',
		'claude-searchbot'   => 'Claude-SearchBot',
		'claude-user'        => 'Claude-User',
		'claudebot'          => 'ClaudeBot',
		'perplexity-user'    => 'Perplexity-User',
		'perplexitybot'      => 'PerplexityBot',
		'googlebot'          => 'Googlebot',
		'bingbot'            => 'bingbot',
		'applebot'           => 'Applebot',
		'meta-externalagent' => 'meta-externalagent',
		'bytespider'         => 'Bytespider',
		'ccbot'              => 'CCBot',
		'amazonbot'          => 'Amazonbot',
		'duckassistbot'      => 'DuckAssistBot',
	);
}

/** The bot id for a user agent, or an empty string for people and other bots. */
function arrowsterr_crawler_of($ua) {
	$ua = (string) $ua;
	if ($ua === '') {
		return '';
	}
	foreach (arrowsterr_crawler_bots() as $id => $token) {
		if (stripos($ua, $token) !== false) {
			return $id;
		}
	}
	return '';
}

function arrowsterr_crawls_table() {
	global $wpdb;
	return $wpdb->prefix . 'arrowsterr_crawls';
}

function arrowsterr_crawls_on() {
	return (bool) apply_filters('arrowsterr_log_crawlers', true);
}

/** Make the table, once per table version. */
function arrowsterr_crawls_install() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table = arrowsterr_crawls_table();
	dbDelta("CREATE TABLE {$table} (
  day date NOT NULL,
  bot varchar(32) NOT NULL,
  path varchar(191) NOT NULL,
  hits int unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY  (day,bot,path),
  KEY day (day)
) " . $wpdb->get_charset_collate() . ';');
	update_option('arrowsterr_crawls_db', ARROWSTERR_CRAWLS_DB, true);
}

register_activation_hook(__FILE__, 'arrowsterr_crawls_install');

// An updated plugin (a new zip) doesn't run the activation hook, so check the table version too.
add_action('admin_init', function () {
	if (get_option('arrowsterr_crawls_db') !== ARROWSTERR_CRAWLS_DB) {
		arrowsterr_crawls_install();
	}
});

/** Remove old rows and check the size, at most once an hour. */
function arrowsterr_crawls_tidy() {
	global $wpdb;
	if (get_transient('arrowsterr_crawls_tidy')) {
		return;
	}
	set_transient('arrowsterr_crawls_tidy', '1', HOUR_IN_SECONDS);
	$table = arrowsterr_crawls_table();
	$since = gmdate('Y-m-d', time() - ARROWSTERR_CRAWLS_DAYS * DAY_IN_SECONDS);
	$wpdb->query($wpdb->prepare("DELETE FROM {$table} WHERE day < %s", $since)); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours.
	$rows = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}"); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	update_option('arrowsterr_crawls_full', $rows >= ARROWSTERR_CRAWLS_MAX_ROWS ? '1' : '', true);
}

/** The path a crawler asked for, as stored: no query, no trailing slash, up to 191 characters. */
function arrowsterr_crawl_path() {
	$path = preg_replace('/[\x00-\x1F\x7F]/', '', arrowsterr_request_path());
	$path = '/' . ltrim((string) $path, '/');
	if (strlen($path) > 1) {
		$path = rtrim($path, '/');
	}
	return function_exists('mb_substr') ? mb_substr($path, 0, 191) : substr($path, 0, 191);
}

/** Count this request when an AI crawler sent it. Runs before llms.txt is served, so that read counts too. */
function arrowsterr_log_crawler() {
	if (!arrowsterr_crawls_on() || is_admin() || wp_doing_ajax() || wp_doing_cron() || (defined('WP_CLI') && WP_CLI)) {
		return;
	}
	$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
	if ($method !== 'GET' && $method !== 'HEAD') {
		return;
	}
	$bot = arrowsterr_crawler_of(isset($_SERVER['HTTP_USER_AGENT']) ? wp_unslash($_SERVER['HTTP_USER_AGENT']) : ''); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- only matched against fixed words.
	if ($bot === '') {
		return;
	}
	$path = arrowsterr_crawl_path();
	if (preg_match('~^/(wp-json|wp-admin|wp-login\.php|xmlrpc\.php|wp-cron\.php)(/|$)~i', $path)) {
		return;
	}
	global $wpdb;
	if (get_option('arrowsterr_crawls_db') !== ARROWSTERR_CRAWLS_DB) {
		arrowsterr_crawls_install();
	}
	$table = arrowsterr_crawls_table();
	$day   = gmdate('Y-m-d');
	$shown = $wpdb->hide_errors();
	if (get_option('arrowsterr_crawls_full', '') === '1') {
		// Full: only pages already counted keep counting.
		$wpdb->query($wpdb->prepare("UPDATE {$table} SET hits = hits + 1 WHERE day = %s AND bot = %s AND path = %s", $day, $bot, $path)); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	} else {
		$wpdb->query($wpdb->prepare("INSERT INTO {$table} (day, bot, path, hits) VALUES (%s, %s, %s, 1) ON DUPLICATE KEY UPDATE hits = hits + 1", $day, $bot, $path)); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}
	if ($shown) {
		$wpdb->show_errors();
	}
	arrowsterr_crawls_tidy();
}
add_action('init', 'arrowsterr_log_crawler', -10);

/** The counts for the last $days days, biggest first, and the site's key pages to check them against. */
function arrowsterr_crawls_report($days) {
	global $wpdb;
	$days  = max(1, min(ARROWSTERR_CRAWLS_DAYS, (int) $days));
	$table = arrowsterr_crawls_table();
	$since = gmdate('Y-m-d', time() - ($days - 1) * DAY_IN_SECONDS);
	$rows  = array();
	$first = null;
	if (get_option('arrowsterr_crawls_db') === ARROWSTERR_CRAWLS_DB) {
		$shown = $wpdb->hide_errors();
		$got   = $wpdb->get_results($wpdb->prepare("SELECT day, bot, path, hits FROM {$table} WHERE day >= %s ORDER BY hits DESC LIMIT 5000", $since), ARRAY_N); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$first = $wpdb->get_var("SELECT MIN(day) FROM {$table}"); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ($shown) {
			$wpdb->show_errors();
		}
		foreach ((array) $got as $r) {
			$rows[] = array((string) $r[0], (string) $r[1], (string) $r[2], (int) $r[3]);
		}
	}
	// Key pages: the homepage, then published pages and the newest posts.
	$home  = rtrim((string) wp_parse_url(home_url('/'), PHP_URL_PATH), '/');
	$pages = array('/');
	$ids   = get_posts(array('post_type' => array('page', 'post'), 'post_status' => 'publish', 'has_password' => false, 'orderby' => array('post_type' => 'ASC', 'date' => 'DESC'), 'fields' => 'ids', 'posts_per_page' => 200, 'suppress_filters' => true));
	foreach ($ids as $id) {
		$path = (string) wp_parse_url((string) get_permalink($id), PHP_URL_PATH);
		if ($home !== '' && strpos($path, $home) === 0) {
			$path = substr($path, strlen($home));
		}
		$path = '/' . trim($path, '/');
		if (!in_array($path, $pages, true)) {
			$pages[] = $path;
		}
	}
	return array(
		'version'    => ARROWSTERR_CONNECTOR_VERSION,
		'logging'    => arrowsterr_crawls_on(),
		'since'      => $first ? (string) $first : null,
		'full'       => get_option('arrowsterr_crawls_full', '') === '1',
		'page_cache' => defined('WP_CACHE') && WP_CACHE,
		'rows'       => $rows,
		'pages'      => $pages,
	);
}

/** Leaves no table or settings behind when the plugin is deleted. */
function arrowsterr_crawls_uninstall() {
	global $wpdb;
	$wpdb->query('DROP TABLE IF EXISTS ' . arrowsterr_crawls_table()); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
	delete_option('arrowsterr_crawls_db');
	delete_option('arrowsterr_crawls_full');
	delete_transient('arrowsterr_crawls_tidy');
}
register_uninstall_hook(__FILE__, 'arrowsterr_crawls_uninstall');
