import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { allowedExternal } from '../src/main/ipc';

describe('allowedExternal for cloud links and external resources', () => {
  test('allows Google Drive and Google Photos links', () => {
    assert.ok(allowedExternal('https://drive.google.com/drive/folders/12345'));
    assert.ok(allowedExternal('https://photos.google.com/share/AF1Qip...'));
    assert.ok(allowedExternal('https://photos.app.goo.gl/abcdef'));
  });

  test('allows Dropbox links', () => {
    assert.ok(allowedExternal('https://www.dropbox.com/scl/fo/12345'));
    assert.ok(allowedExternal('https://dropbox.com/sh/abcde'));
  });

  test('allows WeTransfer links', () => {
    assert.ok(allowedExternal('https://we.tl/t-123456789'));
    assert.ok(allowedExternal('https://wetransfer.com/downloads/abcdef'));
  });

  test('allows WhatsApp and studio app links', () => {
    assert.ok(allowedExternal('https://wa.me/919876543210'));
    assert.ok(allowedExternal('https://web.whatsapp.com/send?phone=919876543210'));
    assert.ok(allowedExternal('https://app.baawaray.com/dashboard'));
  });

  test('refuses insecure protocols, credentials, and untrusted domains', () => {
    assert.equal(allowedExternal('http://drive.google.com'), false);
    assert.equal(allowedExternal('https://user:pass@drive.google.com'), false);
    assert.equal(allowedExternal('https://malicious-site.com/steal'), false);
    assert.equal(allowedExternal('javascript:alert(1)'), false);
    assert.equal(allowedExternal(''), false);
  });
});
