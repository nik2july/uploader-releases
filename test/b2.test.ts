import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseDriveLink, parseB2Link } from '../src/main/driveDownloader';
import { B2Client } from '../src/main/b2Client';

describe('Drive & B2 Link Parsers', () => {
  test('parseDriveLink detects folder and file IDs correctly', () => {
    const folder = parseDriveLink('https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ?usp=sharing');
    assert.deepEqual(folder, { id: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ', type: 'folder' });

    const file = parseDriveLink('https://drive.google.com/file/d/1XyZ9876543210/view?usp=sharing');
    assert.deepEqual(file, { id: '1XyZ9876543210', type: 'file' });

    const notDrive = parseDriveLink('https://f005.backblazeb2.com/file/my-bucket/raw/clip1.mp4');
    assert.equal(notDrive, null);
  });

  test('parseB2Link parses b2:// URIs correctly', () => {
    const uriWithBucket = parseB2Link('b2://my-bucket/raw-footage/wedding/clip1.mov');
    assert.deepEqual(uriWithBucket, {
      bucket: 'my-bucket',
      prefix: 'raw-footage/wedding/clip1.mov'
    });

    const uriPrefixOnly = parseB2Link('b2://wedding-clips');
    assert.deepEqual(uriPrefixOnly, {
      prefix: 'wedding-clips'
    });
  });

  test('parseB2Link parses backblazeb2.com web URLs correctly', () => {
    const webUrl = parseB2Link('https://f005.backblazeb2.com/file/baawaray-raw/projects/job101/source.zip');
    assert.deepEqual(webUrl, {
      bucket: 'baawaray-raw',
      prefix: 'projects/job101/source.zip'
    });

    const notB2 = parseB2Link('https://drive.google.com/drive/folders/12345');
    assert.equal(notB2, null);
  });
});

describe('B2Client', () => {
  test('initializes disconnected without credentials', () => {
    const client = new B2Client();
    assert.equal(client.isConnected(), false);
    assert.equal(client.credentials, undefined);
  });

  test('connects when Key ID, Application Key and Bucket Name are set', () => {
    const client = new B2Client({
      keyId: '005abc123',
      applicationKey: 'K005def456',
      bucketName: 'baawaray-raw'
    });
    assert.equal(client.isConnected(), true);
    assert.equal(client.credentials?.bucketName, 'baawaray-raw');
  });

  test('refuses authorization without valid credentials', async () => {
    const client = new B2Client();
    await assert.rejects(
      client.authorize(),
      /Backblaze B2 Key ID and Application Key are required/
    );
  });
});
