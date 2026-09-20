import { requireSession, isAdmin } from '../server/auth.js';
import { databaseConfigured, query } from '../server/db.js';
import { json, methodNotAllowed, parseBody, publicError } from '../server/http.js';
import { validatePost } from '../server/journal.js';
export default async function handler(req,res){
 if(!['GET','POST','PATCH'].includes(req.method))return methodNotAllowed(res,['GET','POST','PATCH']);
 try {
  const q=req.query||{};
  if(req.method==='GET'&&!q.mine&&!q.review){
   if(!databaseConfigured())return json(res,200,{posts:[],available:false});
   if(q.id&&!/^[0-9a-f-]{36}$/i.test(q.id))return json(res,400,{error:'Invalid story reference.'});
   const result=await query(`SELECT id,author_name,kind,title,summary,body,instagram_url,published_at FROM journal_posts WHERE status='published' ${q.id?'AND id=$1':''} ORDER BY published_at DESC LIMIT 100`,q.id?[q.id]:[]);
   return json(res,200,{posts:result.rows,available:true});
  }
  const session=await requireSession(req,res);if(!session)return;
  const admin=isAdmin(session);
  if(req.method==='GET'){
   if(q.review&&!admin)return json(res,403,{error:'Administrator access required.'});
   const result=await query(`SELECT * FROM journal_posts ${q.review?"WHERE status='pending'":"WHERE user_id=$1"} ORDER BY created_at DESC LIMIT 100`,q.review?[]:[session.user.id]);
   return json(res,200,{posts:result.rows,admin});
  }
  const body=parseBody(req);
  if(req.method==='PATCH'){
   if(!admin)return json(res,403,{error:'Administrator access required.'});
   if(!['published','rejected'].includes(body.status)||!/^[0-9a-f-]{36}$/i.test(body.id||''))return json(res,400,{error:'Invalid moderation action.'});
   const result=await query(`UPDATE journal_posts SET status=$2,published_at=CASE WHEN $2='published' THEN now() ELSE NULL END WHERE id=$1 RETURNING id`,[body.id,body.status]);
   return json(res,result.rowCount?200:404,{updated:!!result.rowCount});
  }
  let post;try{post=validatePost(body,admin);}catch(error){return json(res,400,{error:error.message});}
  // Serialize submissions for each author to enforce the daily limit under concurrency.
  const {transaction}=await import('../server/db.js');
  const saved=await transaction(async client=>{
   await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[session.user.id]);
   const count=await client.query("SELECT count(*) FROM journal_posts WHERE user_id=$1 AND created_at>now()-interval '1 day'",[session.user.id]);
   if(Number(count.rows[0].count)>=10)return null;
   const result=await client.query(`INSERT INTO journal_posts(user_id,author_name,kind,title,summary,body,instagram_url,status,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8='published' THEN now() ELSE NULL END) RETURNING id,status`,[session.user.id,post.kind==='traveler'?session.user.name:'KuboVistas',post.kind,post.title,post.summary,post.body,post.instagram_url,admin?'published':'pending']);return result.rows[0];
  });
  return saved?json(res,201,{post:saved}):json(res,429,{error:'You can submit up to 10 stories per day. Please try tomorrow.'});
 }catch(error){const failure=publicError(error);return json(res,failure.status,{error:failure.message});}
}
