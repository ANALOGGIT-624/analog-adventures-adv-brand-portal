import test from "node:test";
import assert from "node:assert/strict";
import { loadCampaignProducts } from "../app/lib/campaign-products.server.js";
function client(pages, seen = []) {return {graphql: async (_query,{variables}) => {seen.push(variables.after);return {json:async()=>pages.shift()};}};}
const page=(nodes,hasNextPage,endCursor)=>({data:{products:{nodes,pageInfo:{hasNextPage,endCursor}}}});
test("campaign picker includes later-page products and deduplicates repeated edges",async()=>{
 const seen=[];const early={id:"1",title:"First",status:"ACTIVE"};const brass={id:"51",title:"Brass Ball Marker",status:"ACTIVE"};
 assert.deepEqual(await loadCampaignProducts(client([page([early],true,"next"),page([early,brass],false,null)],seen)),[early,brass]);
 assert.deepEqual(seen,[null,"next"]);
});
test("never returns a partial catalog after an API error",async()=>{
 await assert.rejects(loadCampaignProducts(client([page([{id:"1"}],true,"next"),{errors:[{message:"Denied"}]}])),/Denied/);
});
test("rejects a repeated cursor instead of looping",async()=>{
 await assert.rejects(loadCampaignProducts(client([page([],true,"same"),page([],true,"same")])),/did not advance/);
});
