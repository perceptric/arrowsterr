import sys,re
BAD=[(r'—','em dash'),(r'[☀-➿\U0001F300-\U0001FAFF]','emoji'),(r'\[image','image placeholder'),
 (r'\bquietly\b','quietly'),(r'\b\d+% (off|cheaper|less|savings?)|\bsave[s]? (about )?\d+%|months? free|you save','yearly savings'),
 (r'per prompt|per user cost|a month for \d+ prompts|in total|totals? (of|come)','price math?'),
 (r'\b(seamless|robust|game-changer|unlock|leverage|elevate|dive in|landscape|powerful|cutting-edge)\b','hype word'),
 (r'\bnot (just )?\w+(\s\w+)?, (but )?\w+','not X, Y?'),(r'G2|Capterra|stars?\b','ratings?')]
GEN=re.compile(r'^## (FAQ|Conclusion|Wrapping up|Overview|At a glance|Where to start|Summary)\s*$',re.M)
for f in sys.argv[1:]:
    t=open(f).read(); body=t.split('---',2)[2] if t.startswith('---') else t
    w=len(re.findall(r'\w+',body)); hits=[]
    for pat,n in BAD:
        for m in re.finditer(pat,body,re.I): hits.append(f'{n}: ...{body[max(0,m.start()-50):m.end()+30]!r}')
    for m in GEN.finditer(body): hits.append(f'generic heading: {m.group(0)}')
    fm=t.split('---',2)[1]
    for k in ['title','slug','target_keyword','meta_description','updated','status']:
        if not re.search(rf'^{k}:',fm,re.M): hits.append(f'missing front matter {k}')
    md=re.search(r'meta_description: "(.*)"',fm); 
    if md and not 120<=len(md.group(1))<=165: hits.append(f'meta length {len(md.group(1))}')
    chk=len(re.findall(r'\(check\)',body))
    print(f'== {f.split("/")[-1]} words={w} checks={chk}'); [print('  ',h) for h in hits[:15]]
