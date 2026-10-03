import {test,expect} from '@playwright/test';
import {createHmac} from 'node:crypto';
function token(){const b64=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');const data=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:'Helloworld0822',role:'admin',avatar_url:'',exp:Math.floor(Date.now()/1000)+3600});return data+'.'+createHmac('sha256','benchmark-only-test-secret').update(data).digest('base64url')}
test('Forge public pages and markdown sanitization',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.getByRole('heading',{name:'프로젝트',exact:true})).toBeVisible();await expect(page.getByText('Grizzly Hacks 2 우승')).toBeVisible();await page.getByRole('link',{name:'블로그',exact:true}).click();await page.getByRole('link',{name:'Post 1',exact:true}).click();await expect(page.locator('.markdown')).toContainText('Benchmark body.');await expect(page.getByRole('heading',{name:'댓글',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('Forge administrator creates, updates and deletes a post',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(value=>localStorage.setItem('auth_token',value),token());await page.goto('/admin/posts');await page.getByRole('button',{name:'새 항목',exact:true}).click();await page.locator('#editor-json').fill(JSON.stringify({title:'Forge browser test',excerpt:'E2E',content_markdown:'# Safe\n<script>window.evil=1</script>',published:true}));await page.getByRole('button',{name:'Markdown 미리보기'}).click();await expect(page.locator('#preview h1')).toHaveText('Safe');expect(await page.evaluate(()=>Reflect.get(window,'evil'))).toBeUndefined();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('heading',{name:'Forge browser test',exact:true})).toBeVisible();let card=page.locator('.card').filter({has:page.getByRole('heading',{name:'Forge browser test',exact:true})});await card.getByRole('button',{name:'편집',exact:true}).click();const body=JSON.parse(await page.locator('#editor-json').inputValue());body.title='Updated Forge post';await page.locator('#editor-json').fill(JSON.stringify(body));await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('heading',{name:'Updated Forge post',exact:true})).toBeVisible();card=page.locator('.card').filter({has:page.getByRole('heading',{name:'Updated Forge post',exact:true})});await card.getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('heading',{name:'Updated Forge post',exact:true})).toHaveCount(0);expect(errors).toEqual([]);
});
test('Forge ban administration uses IP and login identifiers',async({page})=>{
 await page.addInitScript(value=>localStorage.setItem('auth_token',value),token());await page.goto('/admin/bans');
 await page.locator('#ban-json').fill(JSON.stringify({ip:'203.0.113.121',reason:'browser test'}));await page.getByRole('button',{name:'IP 차단',exact:true}).click();let card=page.locator('.card').filter({hasText:'203.0.113.121'});await expect(card).toBeVisible();await card.getByRole('button',{name:'차단 해제'}).click();await expect(card).toHaveCount(0);
 await page.locator('#ban-json').fill(JSON.stringify({login:'browser-test-user',reason:'browser test'}));await page.getByRole('button',{name:'사용자 차단',exact:true}).click();card=page.locator('.card').filter({hasText:'browser-test-user'});await expect(card).toBeVisible();await card.getByRole('button',{name:'차단 해제'}).click();await expect(card).toHaveCount(0);
});
test('untrusted post text and Markdown cannot create executable DOM',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const title='<img src=x onerror="window.forgeXss=1">';
 const markdown='# Safe content\n<script>window.forgeXss=1</script>\n<img src=x onerror="window.forgeXss=2">\n<svg onload="window.forgeXss=3"></svg>\n[unsafe](javascript:window.forgeXss=4)\n<a href="data:text/html,test">data link</a>';
 await page.route('**/api/posts/1',route=>route.fulfill({json:{id:1,title,content_markdown:markdown,published:true}}));
 await page.route('**/api/posts/1/comments',route=>route.fulfill({json:[]}));
 await page.goto('/blog/1');
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 await expect(page.locator('.markdown h1')).toHaveText('Safe content');
 expect(await page.evaluate(()=>Reflect.get(window,'forgeXss'))).toBeUndefined();
 await expect(page.locator('.markdown script,.markdown [onerror],.markdown [onload],.markdown a[href^="javascript:"],.markdown a[href^="data:"]')).toHaveCount(0);
 expect(errors).toEqual([]);
});
