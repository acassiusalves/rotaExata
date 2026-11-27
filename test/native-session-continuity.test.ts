import assert from 'node:assert/strict';
import {test} from 'node:test';
import {accountReturnPath} from '../src/lib/driver/mode.ts';
import {localSessionId,nativeAuthStorage,nativeStorageKey,retireStoredSession,reusableAssurance} from '../src/lib/earnings/session-storage.ts';

const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const token=(session_id:string)=>'x.'+Buffer.from(JSON.stringify({session_id})).toString('base64url')+'.x';

test('I3 logout local rejeita persistência tardia e sessão antiga em outra aba, sem rede',()=>{
  const disk=new Map<string,string>();
  const storage={getItem:(k:string)=>disk.get(k) ?? null,setItem:(k:string,v:string)=>void disk.set(k,v),removeItem:(k:string)=>void disk.delete(k)};
  const adapter=nativeAuthStorage(storage);
  const previous=JSON.stringify({access_token:token(id)});
  adapter.setItem(nativeStorageKey,previous);
  assert.ok(adapter.getItem(nativeStorageKey));
  retireStoredSession(storage,token(id));
  adapter.setItem(nativeStorageKey,previous);
  assert.equal(adapter.getItem(nativeStorageKey),null);
  adapter.setItem(nativeStorageKey,JSON.stringify({access_token:token(other)}));
  assert.equal(localSessionId(JSON.parse(adapter.getItem(nativeStorageKey)!).access_token),other);
});

test('I4 a árvore da sessão aprovada sobrevive à renovação e troca de usuário revoga a continuidade',()=>{
  const verified={sessionId:id,userId:'driver-a',factors:[]};
  assert.equal(reusableAssurance(verified,id,'driver-a'),true);
  assert.equal(reusableAssurance(verified,other,'driver-a'),false);
  assert.equal(reusableAssurance(verified,id,'driver-b'),false);
  assert.equal(reusableAssurance({...verified,factors:[1]},id,'driver-a'),false);
});

test('I1 recuperação mantém o retorno interno do operador e rejeita URLs externas',()=>{
  assert.equal(accountReturnPath('/driver/admin/accounts'),'/driver/admin/accounts');
  assert.equal(accountReturnPath('/financeiro/pagamentos?month=2026-11'),'/financeiro/pagamentos?month=2026-11');
  assert.equal(accountReturnPath('//example.test/financeiro'),'/my-routes');
  assert.equal(accountReturnPath('/driver/conta?next=/financeiro'),'/my-routes');
});
