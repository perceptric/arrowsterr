import re,sys,html,json,os
SHOTS=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'shots.json')))

VIDEO='<figure class="aw-fig"><video controls playsinline preload="metadata" width="1920" height="1080" poster="https://arrowsterr.com/wp-content/themes/arrowsterr/assets/video/arrowsterr-launch.webp?v=1793503042" aria-label="Arrowsterr launch film" style="display:block;width:100%;height:auto"><source src="https://arrowsterr.com/wp-content/themes/arrowsterr/assets/video/arrowsterr-launch.mp4?v=1793503042" type="video/mp4"></video><figcaption>The Arrowsterr launch film: AI visibility, keyword research and content in one platform.</figcaption></figure>'
BANNERS={
 'snapshot':('Does ChatGPT recommend <span class="accent">your brand</span>?','See what ChatGPT and Google&#8217;s AI say about your brand in about a minute.','Run a free Snapshot','https://arrowsterr.com/snapshot/'),
 'research':('Find the keywords <span class="accent">your rivals win</span>','Keyword research with AI Overview sources, competitor gaps and a content plan. Free for 7 days.','Try Arrowsterr free','https://app.arrowsterr.com/'),
 'visibility':('Track your brand on <span class="accent">6 AIs</span>','ChatGPT, Gemini, Claude, Perplexity, AI Overviews and AI Mode in one view. Plans from $39 a month.','Start free trial','https://app.arrowsterr.com/'),
}
def banner(kind):
    t,d,b,u=BANNERS.get(kind,BANNERS['snapshot'])
    return f'<aside class="post-cta aw-banner" style="max-width:none;margin:2.4em 0"><div class="post-cta__in"><div class="stack" style="gap:6px"><p class="h3" style="margin:0;color:#fff">{t}</p><p style="margin:0">{d}</p></div><a class="btn btn--white" href="{u}" style="flex:none;text-decoration:none">{b}</a></div></aside>'
def shot(k):
    x=SHOTS[k]
    return f'<figure class="aw-shot"><div class="aw-shot__frame"><div class="aw-shot__bar"><i></i><i></i><i></i><span>{x["domain"]}</span></div><img src="{x["url"]}" alt="{x["name"]} homepage" width="1440" height="900" loading="lazy"></div><figcaption>{x["name"]} homepage, {x["month"]}</figcaption></figure>'
def facts(rows):
    cells=[[c.strip() for c in r.strip().strip('|').split('|')] for r in rows][2:]
    return '<dl class="aw-facts">'+''.join(f'<div><dt>{inline(a)}</dt><dd>{inline(b)}</dd></div>' for a,b,*_ in cells)+'</dl>'

def inline(t):
    t=html.escape(t,quote=False)
    t=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',t)
    t=re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)',r'<em>\1</em>',t)
    t=re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)',lambda m:f'<a href="{m.group(2)}">{m.group(1)}</a>',t)
    return t.replace("'","&#8217;") if False else t
def parse(path):
    raw=open(path).read(); m=re.match(r'---\n(.*?)\n---\n',raw,re.S); fm={}
    for l in m.group(1).splitlines():
        if re.match(r'^\w+:',l):
            k,_,v=l.partition(':'); fm[k.strip()]=v.strip().strip('"')
    return fm, raw[m.end():]
def table(rows,caption):
    cells=[[c.strip() for c in r.strip().strip('|').split('|')] for r in rows]
    head,body=cells[0],[r for r in cells[2:]]
    o=['<div class="aw-scroll"><table class="aw-table">',f'<caption class="aw-table__caption">{inline(caption)}</caption>','<thead><tr>']
    o+= [f'<th scope="col"{" class=\"aw-table__label\"" if i==0 else ""}>{inline(h)}</th>' for i,h in enumerate(head)]
    o.append('</tr></thead><tbody>')
    for r in body:
        o.append('<tr>'+''.join(f'<th scope="row" class="aw-table__label"><strong>{inline(c)}</strong></th>' if i==0 else f'<td data-label="{html.escape(re.sub(r"[*`]","",head[i]) if i<len(head) else "")}"><span class="aw-table__value">{inline(c)}</span></td>' for i,c in enumerate(r))+'</tr>')
    o.append('</tbody></table></div>'); return '\n'.join(o)
def convert(path):
    fm,body=parse(path); lines=body.split('\n'); out=[]; i=0; h2=''; mode=None; toc_done=False
    blocks=[]  # (kind, data)
    while i<len(lines):
        l=lines[i]
        if not l.strip(): i+=1; continue
        mk=re.match(r'^<!--\s*(shot|banner|video|facts)\s*:?\s*([\w-]*)\s*-->\s*$',l.strip())
        if mk:
            kind,arg=mk.groups()
            if kind=='facts':
                i+=1
                while i<len(lines) and not lines[i].strip(): i+=1
                rows=[]
                while i<len(lines) and lines[i].startswith('|'): rows.append(lines[i]); i+=1
                blocks.append(('raw',facts(rows))); continue
            blocks.append(('raw',shot(arg) if kind=='shot' else banner(arg) if kind=='banner' else VIDEO)); i+=1; continue
        if l.strip().startswith('<!--'): i+=1; continue
        if l.startswith('# '): i+=1; continue
        if l.startswith('## '): blocks.append(('h2',l[3:].strip())); i+=1; continue
        if l.startswith('### '): blocks.append(('h3',l[4:].strip())); i+=1; continue
        if l.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].startswith('|'): rows.append(lines[i]); i+=1
            blocks.append(('table',rows)); continue
        if re.match(r'^[-*] ',l):
            items=[]
            while i<len(lines) and (re.match(r'^[-*] ',lines[i]) or (lines[i].startswith('  ') and lines[i].strip())):
                if re.match(r'^[-*] ',lines[i]): items.append(lines[i][2:].strip())
                else: items[-1]+=' '+lines[i].strip()
                i+=1
            blocks.append(('ul',items)); continue
        para=[l.strip()]; i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||[-*] )',lines[i]): para.append(lines[i].strip()); i+=1
        blocks.append(('p',' '.join(para)))
    # render
    j=0; cur_h2=''
    # insert aw-try before the h2 that follows an Arrowsterr review h2
    nb=[];inrev=False
    for b in blocks:
        if b[0]=='h2':
            if inrev: nb.append(('raw','<p class="aw-try"><a href="https://app.arrowsterr.com/">Start your free trial</a> of Arrowsterr, with both toolsets for 7 days and no card.</p>'))
            inrev=b[1].lower().startswith('arrowsterr')
        nb.append(b)
    blocks=nb
    while j<len(blocks):
        k,d=blocks[j]
        if k=='h2':
            cur_h2=d
            if d.lower().endswith('main points'):
                j+=1; inner=[]
                while j<len(blocks) and blocks[j][0] not in('h2',):
                    kk,dd=blocks[j]
                    inner.append('<ul>'+''.join(f'<li>{inline(x)}</li>' for x in dd)+'</ul>' if kk=='ul' else f'<p>{inline(dd)}</p>'); j+=1
                out.append(f'<div class="aw-box"><p class="aw-box__t">{inline(d)}</p>{"".join(inner)}</div>')
                out.append('<nav class="aw-toc" data-toc><b>On this page</b></nav>'); toc_done=True; continue
            if not toc_done: out.append('<nav class="aw-toc" data-toc><b>On this page</b></nav>'); toc_done=True
            out.append(f'<h2>{inline(d)}</h2>')
            if d.lower().endswith(' faq'):
                j+=1
                while j<len(blocks) and blocks[j][0]!='h2':
                    if blocks[j][0]=='h3':
                        q=blocks[j][1]; j+=1; ans=[]
                        while j<len(blocks) and blocks[j][0] not in('h2','h3'):
                            kk,dd=blocks[j]; ans.append('<ul>'+''.join(f'<li>{inline(x)}</li>' for x in dd)+'</ul>' if kk=='ul' else f'<p>{inline(dd)}</p>'); j+=1
                        out.append(f'<details><summary>{inline(q)}</summary>{"".join(ans)}</details>')
                    else:
                        kk,dd=blocks[j]; out.append(f'<p>{inline(dd)}</p>' if kk=='p' else ''); j+=1
                continue
            if d.lower().startswith('arrowsterr'):
                pass
            if d.lower().startswith('where arrowsterr fits'):
                j+=1
                while j<len(blocks) and blocks[j][0]!='h2':
                    kk,dd=blocks[j]; out.append(f'<p>{inline(dd)}</p>' if kk=='p' else '<ul>'+''.join(f'<li>{inline(x)}</li>' for x in dd)+'</ul>'); j+=1
                out.append('<p class="aw-try"><a href="https://app.arrowsterr.com/">Try Arrowsterr free</a> to track your brand on 6 AIs.</p>'); continue
        elif k=='raw': out.append(d)
        elif k=='h3': out.append(f'<h3>{inline(d)}</h3>')
        elif k=='p': out.append(f'<p>{inline(d)}</p>')
        elif k=='ul': out.append('<ul>\n'+'\n'.join(f'<li>{inline(x)}</li>' for x in d)+'\n</ul>')
        elif k=='table': out.append(table(d, cur_h2.rstrip('.')+'.'))
        j+=1
    return fm,'\n\n'.join(x for x in out if x)
if __name__=='__main__':
    fm,h=convert(sys.argv[1]); print(json.dumps(fm)); print(h)
