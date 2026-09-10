import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCloudArchivalSummary, extractDriveFolderId } from '../src/renderer/src/utils/cloudArchival';
import { FreelanceJob } from '../src/renderer/src/types/freelance';

test('extractDriveFolderId extracts folder and file IDs from various Google Drive URLs', () => {
  assert.equal(
    extractDriveFolderId('https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ?usp=sharing'),
    '1aBcDeFgHiJkLmNoPqRsTuVwXyZ'
  );
  assert.equal(
    extractDriveFolderId('https://drive.google.com/file/d/2bCdEfGhIjKlMnOpQrStUvWxYz/view'),
    '2bCdEfGhIjKlMnOpQrStUvWxYz'
  );
  assert.equal(
    extractDriveFolderId('https://drive.google.com/open?id=3cDeFgHiJkLmNoPqRsTuVwXyZa'),
    '3cDeFgHiJkLmNoPqRsTuVwXyZa'
  );
});

test('calculateCloudArchivalSummary groups multi-editor raw data and blocks countdown until all editors download', () => {
  const sharedRawLink = 'https://drive.google.com/drive/folders/1weddingRawFolder';

  // Two cuts assigned to two different editors sharing the same raw data
  const teaserCut: FreelanceJob = {
    id: 'job-teaser',
    jobCode: 'FL-001',
    title: 'Wedding Teaser',
    serviceType: 'Short Form',
    clientName: 'Grand Studios',
    clientPhone: '111',
    editorName: 'Neha Thakur',
    editorPhone: '8894562004',
    clientCharge: 5000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 2000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    rawDataLink: sharedRawLink,
    stage: 'sent_to_editor',
    downloadedAt: '2026-09-01T10:00:00Z', // Neha has downloaded!
    createdAt: '2026-09-01',
    dueDate: '2026-09-10',
    revisions: [],
    activityLogs: []
  };

  const highlightCut: FreelanceJob = {
    id: 'job-highlight',
    jobCode: 'FL-002',
    title: 'Wedding Highlight Film',
    serviceType: 'Long Form',
    clientName: 'Grand Studios',
    clientPhone: '111',
    editorName: 'Amit Sharma',
    editorPhone: '9999999999',
    clientCharge: 15000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 6000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    rawDataLink: sharedRawLink,
    stage: 'sent_to_editor',
    downloadedAt: undefined, // Amit has NOT downloaded yet!
    createdAt: '2026-09-01',
    dueDate: '2026-09-10',
    revisions: [],
    activityLogs: []
  };

  // Turn 1: Only 1 of 2 editors has downloaded
  const summary1 = calculateCloudArchivalSummary([teaserCut, highlightCut], '2026-09-05');
  assert.equal(summary1.rawDataGroups.length, 1);
  const group1 = summary1.rawDataGroups[0];
  assert.equal(group1.totalEditors, 2);
  assert.equal(group1.downloadedCount, 1);
  assert.equal(group1.allDownloaded, false);
  assert.equal(group1.status, 'awaiting_downloads');

  // Turn 2: Amit now downloads on 2026-09-06
  const highlightCutDownloaded: FreelanceJob = {
    ...highlightCut,
    downloadedAt: '2026-09-06T14:00:00Z'
  };

  const summary2 = calculateCloudArchivalSummary([teaserCut, highlightCutDownloaded], '2026-09-10');
  const group2 = summary2.rawDataGroups[0];
  assert.equal(group2.totalEditors, 2);
  assert.equal(group2.downloadedCount, 2);
  assert.equal(group2.allDownloaded, true);
  // Latest download was 2026-09-06 + 30 days = 2026-10-06
  assert.equal(group2.latestDownloadedAt, '2026-09-06');
  assert.equal(group2.archivalDueDate, '2026-10-06');
  assert.equal(group2.status, 'archived_countdown');
  assert.equal(group2.daysRemaining, 26); // From 2026-09-10 to 2026-10-06 is 26 days

  // Turn 3: 31 days after latest download (e.g. 2026-10-08)
  const summary3 = calculateCloudArchivalSummary([teaserCut, highlightCutDownloaded], '2026-10-08');
  const group3 = summary3.rawDataGroups[0];
  assert.equal(group3.status, 'ready_for_purge');
  assert.ok((group3.daysRemaining || 0) < 0);
});

test('calculateCloudArchivalSummary identifies completed Dropbox deliverables 30 days old', () => {
  const deliverableCut1: FreelanceJob = {
    id: 'job-del-1',
    jobCode: 'FL-D1',
    title: 'Completed 10 days ago',
    serviceType: 'Short Form',
    clientName: 'Client 1',
    clientPhone: '111',
    editorName: 'Neha',
    editorPhone: '111',
    dueDate: '2026-09-01',
    clientCharge: 5000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 2000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    deliveryLink: 'https://www.dropbox.com/s/cut1.mp4',
    stage: 'completed',
    completedDate: '2026-09-01',
    createdAt: '2026-08-20',
    revisions: [],
    activityLogs: []
  };

  const deliverableCut2: FreelanceJob = {
    id: 'job-del-2',
    jobCode: 'FL-D2',
    title: 'Completed 35 days ago',
    serviceType: 'Short Form',
    clientName: 'Client 2',
    clientPhone: '222',
    editorName: 'Amit',
    editorPhone: '222',
    dueDate: '2026-08-05',
    clientCharge: 5000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 2000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    deliveryLink: 'https://www.dropbox.com/s/cut2.mp4',
    stage: 'completed',
    completedDate: '2026-08-05',
    createdAt: '2026-07-20',
    revisions: [],
    activityLogs: []
  };

  const summary = calculateCloudArchivalSummary([deliverableCut1, deliverableCut2], '2026-09-11');
  assert.equal(summary.dropboxDeliverables.length, 2);

  // Cut 2 is completed 37 days ago => eligible for archival
  const del2 = summary.dropboxDeliverables.find(d => d.jobId === 'job-del-2');
  assert.ok(del2);
  assert.equal(del2.status, 'eligible');
  assert.ok(del2.daysSinceCompletion >= 30);

  // Cut 1 is completed 10 days ago => retaining (20 days remaining)
  const del1 = summary.dropboxDeliverables.find(d => d.jobId === 'job-del-1');
  assert.ok(del1);
  assert.equal(del1.status, 'retaining');
  assert.equal(del1.daysRemaining, 20);
});
