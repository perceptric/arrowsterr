import sys,os,json,base64,urllib.request,re,time,html
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import md2wp
S=os.path.dirname(os.path.abspath(__file__)); U=os.environ['WP_URL']; A='Basic '+base64.b64encode(f"{os.environ['WP_USER']}:{os.environ['WP_APP_PASSWORD']}".encode()).decode()
BLOG='/home/user/arrowsterr/docs/marketing/blog'
BAD=[r'with that in mind',r'does not replace',r'doesn.t replace',r'has no backlink',r'can.t replace',r'\(check\)',r'—',r'\bquietly\b',r'Arrowsterr has no',r'Arrowsterr does not',r'It is also not a']
def check(slug):
    t=open(f'{BLOG}/{slug}.md').read(); p=[]
    for b in BAD:
        for m in re.finditer(b,t,re.I): p.append(f'banned {b!r}: ...{t[max(0,m.start()-60):m.end()+40]!r}')
    n=lambda pat: len(re.findall(pat,t))
    if n(r'<!--\s*banner:')!=2: p.append(f'banners={n(r"<!--\s*banner:")}')
    if n(r'<!--\s*video\s*-->')!=1: p.append('video marker')
    if n(r'<!--\s*shot:\s*arrowsterr')!=1: p.append('arrowsterr shot')
    tools=len(re.findall(r'^## What is ',t,re.M))
    if n(r'<!--\s*shot:')!=tools+1: p.append(f'shots={n(r"<!--\s*shot:")} tools={tools}')
    if n(r'<!--\s*facts\s*-->')!=tools: p.append(f'facts={n(r"<!--\s*facts")}')
    for k in re.findall(r'<!--\s*shot:\s*([\w-]+)',t):
        if k not in md2wp.SHOTS: p.append(f'unknown shot {k}')
    tables=n(r'^\|---'.replace('^','(?m)^'))
    return p,len(re.findall(r'\w+',t)),tables
def req(path,data=None,method='GET'):
    h={'Authorization':A}
    if data is not None: h['Content-Type']='application/json'; data=json.dumps(data).encode()
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(U+path,data=data,method=method,headers=h),timeout=120) as f: return json.loads(f.read())
        except urllib.error.URLError as e:
            if i==3: raise
            time.sleep(2**(i+1))
if __name__=='__main__':
    push='--push' in sys.argv; slugs=[a for a in sys.argv[1:] if not a.startswith('--')]
    log=json.load(open(f'{S}/published-versus.json'))
    for slug in slugs:
        p,w,tb=check(slug)
        fm,content=md2wp.convert(f'{BLOG}/{slug}.md')
        if '<!--' in content: p.append('unconverted marker')
        print(f'== {slug} words={w} tables={tb} banners={content.count("aw-banner")} shots={content.count("aw-shot__frame")} facts={content.count("aw-facts")} video={content.count("<video")} arrowsterr-links={len(set(re.findall(r"https://arrowsterr.com/[a-z/-]+",content)))}')
        for x in p: print('   !',x)
        if push and not p:
            pid=log[slug]['id']
            r=req(f'/wp-json/wp/v2/posts/{pid}',{'content':content,'title':fm['title'],'excerpt':fm['meta_description']},'POST')
            ok=r['content']['raw']==content
            time.sleep(1)
            pg=urllib.request.urlopen(urllib.request.Request(r['link']+f'?v={int(time.time())}',headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read().decode()
            print(f'   pushed id={pid} saved={"OK" if ok else "MISMATCH"} live: video={pg.count("arrowsterr-launch.mp4")>0} banners={pg.count("aw-banner")} shots={pg.count("aw-shot__frame")} facts={pg.count("aw-facts")}')
