import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, now, expectRevert, recommend, signRecommendation,
  Status, AppStatus,
} from "./harness.mjs";

// Hooks live inside this describe: top-level hooks would run for every test file in the process.
describe("v4 recommendations", () => {
let sys, snap;
let core, selection;

before(async () => {
  sys = await deploySystem();
  ({ core, selection } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const initiator = () => sys.accounts[1];
const R = (i) => sys.accounts[[16, 17, 18, 19, 14, 11, 10, 9][i]]; // recommenders, none of them a student, donor or the creator
const applicant = async (pid, who) => {
  const [exists, status, score] = await sys.read(core, "getApplicant", [BigInt(pid), who]);
  return { exists, status, score };
};
const recOf = (pid, who) => sys.read(selection, "recommendationOf", [BigInt(pid), who]);

async function applied(opts = {}) {
  // autoRecommend off: start from "nobody has recommended anyone".
  const prog = await setupProgram(sys, { autoRecommend: false, scores: [90, 90, 70, 70, 60], ...opts });
  const students = await prog.openWindowAndApply();
  return { ...prog, students };
}

describe("the recommendation score is no longer self-reported", () => {
  it("ignores the score an applicant types, so they cannot award themselves 100", async () => {
    const p = await applied();
    // harness applies with 100 as the self-reported recommendation. Academic = income = 90 and
    // recommendation 0 -> (90x40 + 90x40 + 0x20) / 10 = 720, not 920.
    assert.equal((await applicant(p.pid, p.students[0])).score, 720);
    assert.deepEqual(await recOf(p.pid, p.students[0]), [0n, 0n]);
  });

  it("a signed recommendation raises the score, and anyone may deliver it", async () => {
    const p = await applied();
    await recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 100, by: sys.accounts[15] });
    assert.equal((await applicant(p.pid, p.students[0])).score, 920); // (3600 + 3600 + 100x20) / 10
    assert.deepEqual(await recOf(p.pid, p.students[0]), [1n, 100n]);
  });

  it("averages several recommenders", async () => {
    const p = await applied();
    await recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 80 });
    await recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(1), score: 100 });
    assert.deepEqual(await recOf(p.pid, p.students[0]), [2n, 90n]);
    assert.equal((await applicant(p.pid, p.students[0])).score, 900); // (3600 + 3600 + 90x20) / 10
  });

  it("changes the ranking: a verified recommendation can lift an applicant above an equal one", async () => {
    const p = await applied({ scores: [70, 70, 70, 70, 70] });
    const [a, b] = p.students;
    await recommend(sys, { pid: p.pid, student: b, recommender: R(0), score: 100 });
    const ranked = await sys.read(selection, "rankApplicants", [BigInt(p.pid)]);
    assert.equal(ranked[0], b);
    assert.ok(ranked.includes(a));
  });

  it("keeps the recommenders' score if the applicant re-applies", async () => {
    const p = await applied();
    const s = p.students[0];
    await recommend(sys, { pid: p.pid, student: s, recommender: R(0), score: 100 });
    await sys.as(s).write(core, "applyToProgram", [BigInt(p.pid), "p2", "d", "e", "r", 90n, 90n, 0n]);
    assert.equal((await applicant(p.pid, s)).score, 920);
  });
});

describe("recommendation validation", () => {
  it("rejects a signature that was not made by the named recommender", async () => {
    const p = await applied();
    const sig = await signRecommendation(sys, { pid: p.pid, student: p.students[0], recommender: R(1), score: 100, deadline: (await now()) + 3600 });
    await expectRevert(
      recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 100, deadline: (await now()) + 3600, signature: sig }),
      "InvalidSignature",
    );
  });

  it("rejects a changed score: the signature covers it", async () => {
    const p = await applied();
    await expectRevert(
      recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 100, signedScore: 40 }),
      "InvalidSignature",
    );
  });

  it("rejects an expired signature", async () => {
    const p = await applied();
    await expectRevert(
      recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 90, deadline: (await now()) - 1 }),
      "SignatureExpired",
    );
  });

  it("rejects a score above 100", async () => {
    const p = await applied();
    await expectRevert(recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 101 }), "InvalidScore");
  });

  it("an applicant cannot recommend themselves", async () => {
    const p = await applied();
    const s = p.students[0];
    await expectRevert(recommend(sys, { pid: p.pid, student: s, recommender: s, score: 100 }), "SelfRecommendation");
  });

  it("one recommender counts once per applicant", async () => {
    const p = await applied();
    await recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 90 });
    await expectRevert(recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 100 }), "AlreadyRecommended");
  });

  it("allows at most five recommenders per applicant", async () => {
    const p = await applied();
    for (let i = 0; i < 5; i++) await recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(i), score: 80 });
    await expectRevert(recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(5), score: 80 }), "TooManyRecommenders");
  });

  it("rejects an address that never applied", async () => {
    const p = await applied();
    await expectRevert(recommend(sys, { pid: p.pid, student: sys.accounts[18], recommender: R(0), score: 90 }), "NotAnApplicant");
  });

  it("does not apply to committee-scored programs: the committee gives every score there", async () => {
    const p = await applied({ screeningMode: 0 });
    await expectRevert(recommend(sys, { pid: p.pid, student: p.students[0], recommender: R(0), score: 90 }), "NotStudentScored");
  });

  it("closes once an applicant has been processed by the shortlist", async () => {
    const p = await applied();
    await warpTo(p.timeline[2]);
    const ranked = await sys.read(selection, "rankApplicants", [BigInt(p.pid)]);
    await sys.as(sys.accounts[15]).write(selection, "resolveShortlist", [BigInt(p.pid), ranked.slice(0, 2), false]);
    assert.equal((await sys.read(core, "getProgram", [BigInt(p.pid)])).status, Status.SCREENING);

    await expectRevert(recommend(sys, { pid: p.pid, student: ranked[0], recommender: R(0), score: 90 }), "AlreadyProcessed");
    // The ones not processed yet can still be recommended.
    await recommend(sys, { pid: p.pid, student: ranked[4], recommender: R(0), score: 90 });
    assert.equal((await applicant(p.pid, ranked[0])).status, AppStatus.SHORTLISTED);
  });
});

describe("restricting who may recommend", () => {
  it("only the creator can set the list, and only while applications are open", async () => {
    const p = await setupProgram(sys, { autoRecommend: false });
    const configure = (who, restricted, add = [], remove = []) =>
      sys.as(who).write(selection, "configureRecommenders", [BigInt(p.pid), restricted, add, remove]);

    await expectRevert(configure(sys.accounts[15], true, [R(0)]), "NotInitiator");
    await configure(initiator(), true, [R(0)]);
    assert.equal(await sys.read(selection, "recommendersRestricted", [BigInt(p.pid)]), true);
    assert.equal(await sys.read(selection, "isRecommender", [BigInt(p.pid), R(0)]), true);

    await warpTo(p.timeline[1] + 1);
    await expectRevert(configure(initiator(), false), "ApplicationsClosed");
  });

  it("in restricted mode only listed recommenders count", async () => {
    const p = await setupProgram(sys, { autoRecommend: false, scores: [90, 90, 70, 70, 60] });
    await sys.as(initiator()).write(selection, "configureRecommenders", [BigInt(p.pid), true, [R(0)], []]);
    const students = await p.openWindowAndApply();

    await expectRevert(recommend(sys, { pid: p.pid, student: students[0], recommender: R(1), score: 100 }), "RecommenderNotAllowed");
    await recommend(sys, { pid: p.pid, student: students[0], recommender: R(0), score: 100 });
    assert.deepEqual(await recOf(p.pid, students[0]), [1n, 100n]);
  });

  it("a recommender removed from the list can no longer recommend", async () => {
    const p = await setupProgram(sys, { autoRecommend: false });
    await sys.as(initiator()).write(selection, "configureRecommenders", [BigInt(p.pid), true, [R(0), R(1)], [R(1)]]);
    const students = await p.openWindowAndApply();
    await expectRevert(recommend(sys, { pid: p.pid, student: students[0], recommender: R(1), score: 100 }), "RecommenderNotAllowed");
    await recommend(sys, { pid: p.pid, student: students[0], recommender: R(0), score: 100 });
  });
});
});
