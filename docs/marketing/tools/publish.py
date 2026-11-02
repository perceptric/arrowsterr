import sys,os,json,base64,urllib.request,re,time,html
from datetime import timezone
import schedule as sched
sys.path.insert(0,os.path.dirname(__file__)); import md2wp
S=os.path.dirname(__file__); U=os.environ['WP_URL']; AUTH=base64.b64encode(f"{os.environ['WP_USER']}:{os.environ['WP_APP_PASSWORD']}".encode()).decode()
BLOG='/home/user/arrowsterr/docs/marketing/blog'
AI={'airops-vs-profound','peec-ai-vs-profound','profound-vs-semrush','conductor-vs-profound'}
def req(path,data=None,method='GET',headers=None,raw=False):
    h={'Authorization':'Basic '+AUTH,'User-Agent':'arrowsterr-publish'}; h.update(headers or {})
    body=data if raw else (json.dumps(data).encode() if data is not None else None)
    if not raw and data is not None: h['Content-Type']='application/json'
    r=urllib.request.Request(U+path,data=body,method=method,headers=h)
    with urllib.request.urlopen(r,timeout=120) as f: return json.loads(f.read())
log=json.load(open(f'{S}/published-versus.json')) if os.path.exists(f'{S}/published-versus.json') else {}
NOW='--now' in sys.argv  # only when the user asks for a post to go live right away
slugs=[a for a in sys.argv[1:] if not a.startswith('--')]
WHEN={} if NOW else dict(sched.plan(slugs,busy=sched.taken()))
for slug in slugs:
    fm,content=md2wp.convert(f'{BLOG}/{slug}.md')
    assert '(check)' not in content, slug
    title=fm['title']
    if slug in log: print(slug,'already published',log[slug]); continue
    if req(f'/wp-json/wp/v2/posts?slug={slug}&status=any&_fields=id'): print(slug,'SLUG EXISTS, skipped'); continue
    png=open(f'{S}/vsimg/{slug}-featured.png','rb').read()
    m=req('/wp-json/wp/v2/media',png,'POST',{'Content-Type':'image/png','Content-Disposition':f'attachment; filename="{slug}-featured.png"'},raw=True)
    req(f'/wp-json/wp/v2/media/{m["id"]}',{'alt_text':title,'title':title},'POST')
    p=req('/wp-json/wp/v2/posts',{'title':title,'slug':slug,'content':content,'excerpt':fm['meta_description'],**({'status':'publish'} if NOW else {'status':'future','date_gmt':WHEN[slug].astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')}),
        'categories':[6 if slug in AI else 7],'featured_media':m['id'],'comment_status':'open','author':1},'POST')
    log[slug]={'id':p['id'],'media':m['id'],'link':p['link'],'status':p['status'],'scheduled':None if NOW else WHEN[slug].isoformat()}; json.dump(log,open(f'{S}/published-versus.json','w'),indent=1)
    if not NOW: print(f"{slug}: id={p['id']} scheduled {WHEN[slug].strftime('%a %b %d %I:%M %p ET')} status={p['status']}"); continue
    time.sleep(1)
    r=urllib.request.urlopen(urllib.request.Request(p['link']+'?v=1',headers={'User-Agent':'Mozilla/5.0'}),timeout=60); page=r.read().decode()
    t=html.unescape(re.search(r'<title>(.*?)</title>',page,re.S).group(1))
    og=re.search(r'og:image" content="([^"]+)"',page); d=re.search(r'og:description" content="([^"]*)"',page)
    print(f"{slug}: id={p['id']} {r.status} title={'OK' if t.startswith(title[:30]) else t!r} image={'OK' if og and slug in og.group(1) else 'CHECK'} desc={'OK' if d and html.unescape(d.group(1))==fm['meta_description'] else 'CHECK'} {p['link']}")
