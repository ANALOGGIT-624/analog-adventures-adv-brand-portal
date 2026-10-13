"""Reviewed, create-only live schema repair. Run only after owner approval."""
import json, pathlib, subprocess
root=pathlib.Path(__file__).resolve().parent.parent
work=root.parent/'recovery-private/live-rollout-20261013/schema-repair'
work.mkdir(mode=0o700,exist_ok=True)
plan=json.loads((root/'docs/live-definition-repair-plan.json').read_text())
ids={}
for item in plan:
 t=item['type']; result=work/(t+'-result.json'); variables=work/(t+'.json'); started=work/(t+'.started')
 if result.exists():
  payload=json.loads(result.read_text()); payload=payload.get('data',payload)
 else:
  if started.exists(): raise SystemExit('Prior uncertain attempt: inspect live definitions before retrying '+t)
  for f in item['fieldDefinitions']:
   for v in f.get('validations',[]):
    if isinstance(v['value'],dict):v['value']=ids[v['value']['resolveLiveDefinitionType']]
  variables.write_text(json.dumps({'definition':item},indent=2)+'\n')
  started.write_text('Attempt started; do not blindly retry.\n')
  subprocess.run(['shopify','store','execute','--store','16e80f-5b.myshopify.com','--query-file',str(root/'docs/create-live-definition.graphql'),'--variable-file',str(variables),'--allow-mutations','--json','--output-file',str(result)],cwd=root,check=True)
  payload=json.loads(result.read_text());payload=payload.get('data',payload)
 r=payload['metaobjectDefinitionCreate']
 if r['userErrors'] or not r['metaobjectDefinition']:raise SystemExit(json.dumps(r['userErrors']))
 actual=r['metaobjectDefinition'];assert actual['type']==t
 ids[t]=actual['id']
 print('Created and recorded '+t+': '+actual['id'])
print('Four definitions created; verify live dashboard before business data entry.')
