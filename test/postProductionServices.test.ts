import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findPostProductionService, resolvePostProductionServices } from '../src/renderer/src/utils/postProductionServices';
import type { CrewRoleConfig } from '../src/renderer/src/types';

/**
 * What Post Production sells, read from the studio's settings.
 *
 * The four services used to be a constant in the source, so a fifth meant a
 * release. The risks in moving them to data are the ones worth testing: a studio
 * that configures nothing must lose nothing, and a service configured by name
 * must replace the built-in one rather than sit beside it as a second copy that
 * prices the same work twice.
 */
const role = (fields: Partial<CrewRoleConfig>): CrewRoleConfig => fields as CrewRoleConfig;

describe('the services post production sells', () => {
  test('a studio that has configured nothing keeps the four it always had', () => {
    const names = resolvePostProductionServices(undefined).map(s => s.name).sort();
    assert.deepEqual(names, ['Album', 'Edited Photos', 'Long Form', 'Short Form']);
  });

  test('a new service is sold once it says how it is measured', () => {
    const services = resolvePostProductionServices([
      role({ id: 'r1', name: 'Instagram Post', postProductionBasis: 'per_item' }),
    ]);
    const post = findPostProductionService('Instagram Post', services);
    assert.equal(post?.basis, 'per_item');
    assert.equal(post?.id, 'r1');
    assert.equal(services.length, 5);
  });

  test('a service with no basis is something the studio delivers itself', () => {
    const services = resolvePostProductionServices([role({ id: 'r2', name: 'Drone Footage' })]);
    assert.equal(findPostProductionService('Drone Footage', services), undefined);
  });

  test('configuring a built-in by name replaces it, not duplicates it', () => {
    const services = resolvePostProductionServices([
      role({ id: 'r3', name: 'short form', postProductionBasis: 'per_item' }),
    ]);
    assert.equal(services.length, 4, 'still four services, not five');
    const shortForm = findPostProductionService('Short Form', services);
    assert.equal(shortForm?.basis, 'per_item', 'the studio setting wins');
    assert.equal(shortForm?.id, 'r3');
  });

  test('unit wording follows the basis so the quotation asks the right question', () => {
    const services = resolvePostProductionServices([
      role({ id: 'r4', name: 'Reels', postProductionBasis: 'per_item' }),
      role({ id: 'r5', name: 'Culling', postProductionBasis: 'per_photo' }),
    ]);
    assert.equal(findPostProductionService('Reels', services)?.rateSuffix, 'per item');
    assert.equal(findPostProductionService('Culling', services)?.measureLabel, 'Photos to deliver');
  });

  test('a basis the app does not know is ignored rather than trusted', () => {
    const services = resolvePostProductionServices([
      role({ id: 'r6', name: 'Mystery', postProductionBasis: 'per_vibe' as never }),
    ]);
    assert.equal(findPostProductionService('Mystery', services), undefined);
  });

  test('names match however they were typed, but only exactly', () => {
    const services = resolvePostProductionServices(undefined);
    assert.equal(findPostProductionService('  edited photos ', services)?.name, 'Edited Photos');
    assert.equal(findPostProductionService('Edited Photo', services), undefined, 'a near miss is not a match');
    assert.equal(findPostProductionService('', services), undefined);
  });
});
