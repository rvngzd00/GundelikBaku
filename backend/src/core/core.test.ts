import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './slug.js';
import { hashPassword, verifyPassword } from './password.js';
import { paginationMeta, paginationSchema } from './pagination.js';

test('Azərbaycan hərfləri sabit SEO slug yaradır',()=>{
  assert.equal(slugify('Gözəllik & Sağlamlıq üçün Ən Yaxşı Təkliflər'),'gozellik-saglamliq-ucun-en-yaxsi-teklifler');
});

test('şifrə hash olunur və yanlış şifrə qəbul edilmir',async()=>{
  const hash=await hashPassword('Çox-Məxfi-Şifrə-2026!');
  assert.equal(await verifyPassword('Çox-Məxfi-Şifrə-2026!',hash),true);
  assert.equal(await verifyPassword('yanlış-şifrə',hash),false);
});

test('pagination limitləri və meta hesabı düzgündür',()=>{
  const query=paginationSchema.parse({page:'2',limit:'20',search:'  test  '});
  assert.deepEqual({page:query.page,limit:query.limit,search:query.search},{page:2,limit:20,search:'test'});
  assert.deepEqual(paginationMeta(2,20,45),{page:2,limit:20,total:45,pages:3});
});
