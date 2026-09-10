import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getEditorWorkflowStage,
  addWorkingDays,
  calculateDynamicDueDates,
  calculateOnTimeReport,
  calculateEditorWorkloads
} from '../src/renderer/src/utils/dynamicScheduling';
import { FreelanceJob } from '../src/renderer/src/types/freelance';
import { TeamMember } from '../src/renderer/src/types';

test('getEditorWorkflowStage categorizes jobs correctly', () => {
  const baseJob: FreelanceJob = {
    id: 'job-1',
    jobCode: 'FL-001',
    title: 'Wedding Highlights',
    serviceType: 'Short Form',
    clientName: 'Grand Studios',
    clientPhone: '9999999999',
    editorName: 'Neha',
    editorPhone: '8894562004',
    clientCharge: 15000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 5000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    stage: 'sent_to_editor',
    createdAt: '2026-09-10',
    dueDate: '2026-09-17',
    revisions: [],
    activityLogs: []
  };

  // When raw footage is not yet downloaded => Download Pending
  assert.equal(getEditorWorkflowStage(baseJob), 'download_pending');
  assert.equal(getEditorWorkflowStage({ ...baseJob, downloadedAt: '2026-09-10T10:00:00Z' }), 'in_process');

  // Changes received / sent to editor => In Process
  assert.equal(getEditorWorkflowStage({ ...baseJob, stage: 'changes_received' }), 'in_process');
  assert.equal(getEditorWorkflowStage({ ...baseJob, stage: 'changes_sent_to_editor' }), 'in_process');

  // Draft received / sent to client => Sent for Review
  assert.equal(getEditorWorkflowStage({ ...baseJob, stage: 'draft_received' }), 'sent_for_review');
  assert.equal(getEditorWorkflowStage({ ...baseJob, stage: 'sent_to_client' }), 'sent_for_review');

  // Final delivered / completed => Finalized
  assert.equal(getEditorWorkflowStage({ ...baseJob, stage: 'final_delivered' }), 'finalized');
  assert.equal(getEditorWorkflowStage({ ...baseJob, stage: 'completed' }), 'finalized');
});

test('addWorkingDays skips off days correctly', () => {
  const leaves = [{ id: '1', from: '2026-09-12', to: '2026-09-12', reason: 'Personal Leave' }];

  // Starting on 2026-09-10:
  // Day 1: 2026-09-11
  // Sept 12 is skipped because of leave!
  // Day 2: 2026-09-13
  const due = addWorkingDays('2026-09-10', 2, leaves);
  assert.equal(due, '2026-09-13');
});

test('calculateDynamicDueDates queues jobs sequentially and respects off days', () => {
  const member: TeamMember = {
    id: 1,
    name: 'Neha',
    role: 'Video Editor',
    phone: '8894562004',
    password: '',
    active: true,
    unavailablePeriods: [
      { id: 'l1', from: '2026-09-13', to: '2026-09-13', reason: 'Off' }
    ]
  };

  const job1: FreelanceJob = {
    id: 'j1',
    jobCode: 'FL-001',
    title: 'Project 1',
    serviceType: 'Short Form',
    clientName: 'Client A',
    clientPhone: '111',
    editorName: 'Neha',
    editorPhone: '8894562004',
    clientCharge: 10000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 3000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    stage: 'sent_to_editor',
    sentToEditorDate: '2026-09-10',
    requiredDays: 2,
    createdAt: '2026-09-10',
    dueDate: '2026-09-17',
    revisions: [],
    activityLogs: []
  };

  const job2: FreelanceJob = {
    id: 'j2',
    jobCode: 'FL-002',
    title: 'Project 2',
    serviceType: 'Long Form',
    clientName: 'Client B',
    clientPhone: '222',
    editorName: 'Neha',
    editorPhone: '8894562004',
    clientCharge: 15000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 4000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    stage: 'sent_to_editor',
    sentToEditorDate: '2026-09-10',
    requiredDays: 3,
    createdAt: '2026-09-10',
    dueDate: '2026-09-17',
    revisions: [],
    activityLogs: []
  };

  const schedule = calculateDynamicDueDates([job1, job2], member, '2026-09-10');

  // Job 1 (2 working days from 2026-09-10):
  // Working Day 1: 2026-09-11
  // Working Day 2: 2026-09-12
  // Due: 2026-09-12
  const res1 = schedule.get('j1');
  assert.ok(res1);
  assert.equal(res1.calculatedDueDate, '2026-09-12');
  assert.equal(res1.queuePosition, 1);

  // Job 2 (3 working days after Job 1):
  // 2026-09-13 is off-day (skipped!)
  // Working Day 3: 2026-09-14
  // Working Day 4: 2026-09-15
  // Working Day 5: 2026-09-16
  // Due: 2026-09-16
  const res2 = schedule.get('j2');
  assert.ok(res2);
  assert.equal(res2.calculatedDueDate, '2026-09-16');
  assert.equal(res2.queuePosition, 2);
});

test('calculateDynamicDueDates gives 2 working days for client changes independently', () => {
  const member: TeamMember = {
    id: 1,
    name: 'Neha',
    role: 'Video Editor',
    phone: '8894562004',
    password: '',
    active: true,
    unavailablePeriods: []
  };

  const changeJob: FreelanceJob = {
    id: 'j-rev',
    jobCode: 'FL-REV',
    title: 'Revision Project',
    serviceType: 'Short Form',
    clientName: 'Client C',
    clientPhone: '333',
    editorName: 'Neha',
    editorPhone: '8894562004',
    clientCharge: 10000,
    clientPaidAmount: 0,
    clientPaymentStatus: 'unpaid',
    clientPayments: [],
    editorPay: 3000,
    editorPaidAmount: 0,
    editorPaymentStatus: 'unpaid',
    editorPayouts: [],
    stage: 'changes_sent_to_editor',
    changesSentToEditorDate: '2026-09-10',
    createdAt: '2026-09-01',
    dueDate: '2026-09-08',
    revisions: [],
    activityLogs: []
  };

  const schedule = calculateDynamicDueDates([changeJob], member, '2026-09-10');
  const res = schedule.get('j-rev');
  assert.ok(res);
  assert.equal(res.isChanges, true);
  // 2 days from 2026-09-10 => 2026-09-12
  assert.equal(res.calculatedDueDate, '2026-09-12');
});

test('calculateOnTimeReport calculates on-time delivery percentage accurately', () => {
  const jobs: FreelanceJob[] = [
    {
      id: 'j1',
      jobCode: 'FL-01',
      title: 'Delivered On Time',
      serviceType: 'Short Form',
      clientName: 'Client 1',
      clientPhone: '1',
      editorName: 'Neha',
      editorPhone: '8894562004',
      clientCharge: 1000,
      clientPaidAmount: 0,
      clientPaymentStatus: 'unpaid',
      clientPayments: [],
      editorPay: 500,
      editorPaidAmount: 0,
      editorPaymentStatus: 'unpaid',
      editorPayouts: [],
      stage: 'final_delivered',
      dueDate: '2026-09-10',
      finalDeliveredDate: '2026-09-09', // Delivered 1 day early!
      createdAt: '2026-09-01',
      revisions: [],
      activityLogs: []
    },
    {
      id: 'j2',
      jobCode: 'FL-02',
      title: 'Delivered Late',
      serviceType: 'Short Form',
      clientName: 'Client 2',
      clientPhone: '2',
      editorName: 'Neha',
      editorPhone: '8894562004',
      clientCharge: 1000,
      clientPaidAmount: 0,
      clientPaymentStatus: 'unpaid',
      clientPayments: [],
      editorPay: 500,
      editorPaidAmount: 0,
      editorPaymentStatus: 'unpaid',
      editorPayouts: [],
      stage: 'final_delivered',
      dueDate: '2026-09-10',
      finalDeliveredDate: '2026-09-12', // Delivered 2 days late!
      createdAt: '2026-09-01',
      revisions: [],
      activityLogs: []
    }
  ];

  const report = calculateOnTimeReport(jobs);
  assert.equal(report.totalDelivered, 2);
  assert.equal(report.onTimeCount, 1);
  assert.equal(report.delayedCount, 1);
  // (1 / 2) * 100 = 50%
  assert.equal(report.onTimeScore, 50);
});

test('calculateEditorWorkloads computes live availability and next available dates', () => {
  const team: TeamMember[] = [
    {
      id: 1,
      name: 'Neha Thakur',
      role: 'Video Editor',
      phone: '8894562004',
      password: '',
      active: true,
      unavailablePeriods: []
    },
    {
      id: 2,
      name: 'Amit Sharma',
      role: 'Video Editor',
      phone: '9999999999',
      password: '',
      active: true,
      unavailablePeriods: []
    },
    {
      id: 3,
      name: 'Pooja Verma',
      role: 'Video Editor',
      phone: '7777777777',
      password: '',
      active: true,
      unavailablePeriods: [
        { id: 'leave-1', from: '2026-09-10', to: '2026-09-13', reason: 'Personal' }
      ]
    }
  ];

  const jobs: FreelanceJob[] = [
    {
      id: 'job-amit-1',
      jobCode: 'FL-A1',
      title: 'Amit Project 1',
      serviceType: 'Short Form',
      clientName: 'Client',
      clientPhone: '000',
      editorMemberId: 2,
      editorName: 'Amit Sharma',
      editorPhone: '9999999999',
      clientCharge: 1000,
      clientPaidAmount: 0,
      clientPaymentStatus: 'unpaid',
      clientPayments: [],
      editorPay: 500,
      editorPaidAmount: 0,
      editorPaymentStatus: 'unpaid',
      editorPayouts: [],
      stage: 'sent_to_editor',
      requiredDays: 2,
      createdAt: '2026-09-10',
      dueDate: '2026-09-12',
      revisions: [],
      activityLogs: []
    }
  ];

  const workloads = calculateEditorWorkloads(jobs, team, '2026-09-10');

  // Neha has 0 jobs and is not on leave => available
  const neha = workloads.find(w => w.memberId === 1);
  assert.ok(neha);
  assert.equal(neha.tone, 'available');
  assert.equal(neha.activeJobsCount, 0);
  assert.ok(neha.statusLabel.includes('Available now'));

  // Amit has 1 active job (2 required days) => light load
  const amit = workloads.find(w => w.memberId === 2);
  assert.ok(amit);
  assert.equal(amit.tone, 'light');
  assert.equal(amit.activeJobsCount, 1);
  assert.equal(amit.totalAllocatedDays, 2);
  assert.ok(amit.statusLabel.includes('1 cut'));

  // Pooja is on leave today (2026-09-10 to 2026-09-13) => on_leave
  const pooja = workloads.find(w => w.memberId === 3);
  assert.ok(pooja);
  assert.equal(pooja.tone, 'on_leave');
  assert.equal(pooja.onLeaveToday, true);
  assert.ok(pooja.statusLabel.includes('On leave until 2026-09-13'));
});

