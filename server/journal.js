export function instagramURL(value) {
 try {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
  const match = url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
  return match ? `https://www.instagram.com/${match[1]}/${match[2]}/` : null;
 } catch { return null; }
}
export function validatePost(body, admin) {
 const text=(key,max)=>typeof body[key]==='string'?body[key].trim().slice(0,max):'';
 const kind=admin&&['company','instagram'].includes(body.kind)?body.kind:'traveler';
 const post={kind,title:text('title',150),summary:text('summary',350),body:text('body',15000),instagram_url:kind==='instagram'?instagramURL(body.instagram_url):null};
 if(post.title.length<5||post.summary.length<20||post.body.length<80)throw new Error('Add a title (5+ characters), summary (20+) and story (80+).');
 if(kind==='instagram'&&!post.instagram_url)throw new Error('Use a public Instagram post or reel permalink.');
 if(body.consent!==true)throw new Error('Confirm that you have permission to publish this content.');
 return post;
}
