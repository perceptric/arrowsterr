<?php
/**
 * Plugin Name:       Arrowsterr Twenty Style
 * Plugin URI:        https://arrowsterr.com/
 * Description:       Puts the arrowsterr.com site in Twenty's design system, the same look as the app. Loads Inter and DM Mono and a stylesheet after the theme's own. Turn it off to go back.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Arrowsterr
 * License:           GPL-2.0-or-later
 */

if (!defined('ABSPATH')) {
	exit;
}

define('ARROWSTERR_TWENTY_VERSION', '1.0.0');

/** Swaps the theme's fonts for Inter and DM Mono, then loads twenty.css after every theme stylesheet. */
function arrowsterr_twenty_styles() {
	$fonts = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap';
	// Point the theme's font handle at the new fonts, so stylesheets that depend on it still load.
	$styles = wp_styles();
	if (isset($styles->registered['aw-fonts'])) {
		$styles->registered['aw-fonts']->src = $fonts;
		$styles->registered['aw-fonts']->ver = null;
	} else {
		wp_enqueue_style('aw-fonts', $fonts, array(), null);
	}

	// Depend on whichever theme stylesheets this page loaded, so twenty.css always prints last.
	$deps = array();
	foreach ($styles->queue as $handle) {
		if (strpos($handle, 'aw-') === 0) {
			$deps[] = $handle;
		}
	}
	wp_enqueue_style(
		'aw-twenty',
		plugins_url('twenty.css', __FILE__),
		$deps,
		ARROWSTERR_TWENTY_VERSION
	);
}
add_action('wp_enqueue_scripts', 'arrowsterr_twenty_styles', 100);
