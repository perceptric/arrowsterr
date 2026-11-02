"""Pick go-live times for new blog posts so a batch never goes out at once.

Rule: posts go live at random times over 14 days, at most 2 a day, at least 3 hours apart,
between 8am and 6pm US Eastern. Days that already hold scheduled posts on WordPress count
toward the limit, so a new batch fills around the last one.
"""
import json,os,base64,random,urllib.request
from datetime import datetime,timedelta,timezone
from zoneinfo import ZoneInfo
ET=ZoneInfo('America/New_York')
DAYS,PER_DAY,GAP_H,FIRST_H,LAST_H=14,2,3,8,17

def taken():
    """Go-live times of posts already scheduled on WordPress."""
    U=os.environ['WP_URL']; A='Basic '+base64.b64encode(f"{os.environ['WP_USER']}:{os.environ['WP_APP_PASSWORD']}".encode()).decode()
    r=urllib.request.Request(U+'/wp-json/wp/v2/posts?status=future&per_page=100&_fields=date_gmt',headers={'Authorization':A})
    return [datetime.fromisoformat(p['date_gmt']).replace(tzinfo=timezone.utc).astimezone(ET) for p in json.loads(urllib.request.urlopen(r,timeout=60).read())]

def plan(slugs,start=None,busy=None,seed=None):
    """Return [(slug, aware datetime)] spread at random over DAYS days from start (default: tomorrow ET)."""
    rnd=random.Random(seed)
    start=start or (datetime.now(ET)+timedelta(days=1)).replace(hour=0,minute=0,second=0,microsecond=0)
    used={}
    for t in busy or []: used.setdefault(t.date(),[]).append(t)
    days=DAYS
    out=[]
    for s in rnd.sample(list(slugs),len(slugs)):
        while True:
            free=[start+timedelta(days=i) for i in range(days) if len(used.get((start+timedelta(days=i)).date(),[]))<PER_DAY]
            if free: break
            days+=7  # window full: stretch it, never stack posts
        for _ in range(2000):
            d=rnd.choice(free)
            t=d.replace(hour=rnd.randint(FIRST_H,LAST_H),minute=rnd.choice(range(0,60,5)),tzinfo=ET)
            if all(abs((t-x).total_seconds())>=GAP_H*3600 for x in used.get(t.date(),[])):
                used.setdefault(t.date(),[]).append(t); out.append((s,t)); break
    return sorted(out,key=lambda x:x[1])
