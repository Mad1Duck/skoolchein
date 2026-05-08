import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ROLES = {
  UPGRADER_ROLE: "0x189ab7a9244df0848122154315af71fe140f3db0fe014031783b0946b8c9d2e3",
  CORE_ROLE: "0x502d3d275257923b2bea6ea25d9631f12369fb532871f13eb85eb09dc0fb4842",
  BOUNTY_ROLE: "0x0303601fb32aa3ffc89171916fb42b72e41ae580d3fb71ada99aa461e6c55660",
  COMMITTEE_ROLE: "0x794daa56950487582951e8db2fdbcbee68c2223c65641d0aa02a3afc64f9a86f",
  RESOLVER_ROLE: "0x92a19c77d2ea87c7f81d50c74403cb2f401780f3ad919571121efe2bdb427eb1",
  MINTER_ROLE: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
  BURNER_ROLE: "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848",
  LOCKER_ROLE: "0xaf9a8bb3cbd6b84fbccefa71ff73e26e798553c6914585a84886212a46a90279",
  GOVERNANCE_ROLE: "0x71840dc4906352362b0cdaf79870196c8e42acafade72d5d5a6d59291253ceb1", // keccak256("GOVERNANCE_ROLE")
};

const USDC_ADDRESS = process.env.USDC_ADDRESS ?? "";
const PROTOCOL_FEE_RECIPIENT = process.env.PROTOCOL_FEE_RECIPIENT ?? "";
const ZERO = "0x0000000000000000000000000000000000000000";

export default buildModule("ScholarshipV4", (m) => {

  const deployer = m.getAccount(0);

  // ── STEP 1 — USDC ──────────────────────────────────────────────────────────
  const usdc = USDC_ADDRESS !== ""
    ? m.contractAt("MockUSDC", USDC_ADDRESS)
    : m.contract("MockUSDC");

  // ── STEP 2 — NFTs ──────────────────────────────────────────────────────────
  const donorNFT = m.contract("DonorNFT");
  const studentNFT = m.contract("StudentNFT");
  const fraudNFT = m.contract("FraudNFT");

  // ── STEP 3 — ScholarshipReputation (UUPS) ──────────────────────────────────
  const reputationImpl = m.contract("ScholarshipReputation", [], { id: "ScholarshipReputation_Impl" });
  const reputationProxy = m.contract("ERC1967Proxy", [
    reputationImpl,
    m.encodeFunctionCall(reputationImpl, "initialize", [deployer]),
  ], { id: "ScholarshipReputation_Proxy" });
  const reputation = m.contractAt("ScholarshipReputation", reputationProxy, { id: "ScholarshipReputation" });

  // ── STEP 4 — ScholarshipTreasury (UUPS) ────────────────────────────────────
  const feeRecipient = PROTOCOL_FEE_RECIPIENT !== "" ? PROTOCOL_FEE_RECIPIENT : deployer;
  const treasuryImpl = m.contract("ScholarshipTreasury", [], { id: "ScholarshipTreasury_Impl" });
  const treasuryProxy = m.contract("ERC1967Proxy", [
    treasuryImpl,
    m.encodeFunctionCall(treasuryImpl, "initialize", [deployer, usdc, feeRecipient]),
  ], { id: "ScholarshipTreasury_Proxy", after: [reputationProxy] });
  const treasury = m.contractAt("ScholarshipTreasury", treasuryProxy, { id: "ScholarshipTreasury" });

  // ── STEP 5 — MilestoneManager (UUPS) ───────────────────────────────────────
  const milestoneManagerImpl = m.contract("MilestoneManager", [], { id: "MilestoneManager_Impl" });
  const milestoneManagerProxy = m.contract("ERC1967Proxy", [
    milestoneManagerImpl,
    m.encodeFunctionCall(milestoneManagerImpl, "initialize", [
      deployer,
      ZERO,          // core — set later
      treasuryProxy,
    ]),
  ], { id: "MilestoneManager_Proxy", after: [treasuryProxy] });
  const milestoneManager = m.contractAt("MilestoneManager", milestoneManagerProxy, { id: "MilestoneManager" });

  // ── STEP 6 — ScholarshipCore (UUPS) ────────────────────────────────────────
  const coreImpl = m.contract("ScholarshipCore", [], { id: "ScholarshipCore_Impl" });
  const coreProxy = m.contract("ERC1967Proxy", [
    coreImpl,
    m.encodeFunctionCall(coreImpl, "initialize", [
      deployer, usdc, treasuryProxy, reputationProxy, donorNFT, studentNFT, fraudNFT, milestoneManagerProxy, ZERO,
    ]),
  ], { id: "ScholarshipCore_Proxy", after: [milestoneManagerProxy] });
  const core = m.contractAt("ScholarshipCore", coreProxy, { id: "ScholarshipCore" });

  // ── STEP 7 — ScholarshipAdmin (UUPS) ───────────────────────────────────────
  const adminImpl = m.contract("ScholarshipAdmin", [], { id: "ScholarshipAdmin_Impl" });
  const adminProxy = m.contract("ERC1967Proxy", [
    adminImpl,
    m.encodeFunctionCall(adminImpl, "initialize", [deployer, coreProxy]),
  ], { id: "ScholarshipAdmin_Proxy", after: [coreProxy] });
  const scholarshipAdmin = m.contractAt("ScholarshipAdmin", adminProxy, { id: "ScholarshipAdmin" });

  // ── STEP 8 — Wire circular deps ────────────────────────────────────────────
  const afterCore = { after: [coreProxy, adminProxy] };
  m.call(milestoneManager, "setCore", [coreProxy], { id: "mm_setCore", ...afterCore });

  // ── STEP 9 — ScholarshipBounty (UUPS) ──────────────────────────────────────
  const bountyImpl = m.contract("ScholarshipBounty", [], { id: "ScholarshipBounty_Impl" });
  const bountyProxy = m.contract("ERC1967Proxy", [
    bountyImpl,
    m.encodeFunctionCall(bountyImpl, "initialize", [deployer, usdc, coreProxy, treasuryProxy]),
  ], { id: "ScholarshipBounty_Proxy", after: [coreProxy] });
  const bounty = m.contractAt("ScholarshipBounty", bountyProxy, { id: "ScholarshipBounty" });

  // ── STEP 10 — CommitteeGovernance (UUPS) ────────────────────────────────────
  const committeeImpl = m.contract("CommitteeGovernance", [], { id: "CommitteeGovernance_Impl" });
  const committeeProxy = m.contract("ERC1967Proxy", [
    committeeImpl,
    m.encodeFunctionCall(committeeImpl, "initialize", [deployer, coreProxy, milestoneManagerProxy]),
  ], { id: "CommitteeGovernance_Proxy", after: [bountyProxy] });
  const committee = m.contractAt("CommitteeGovernance", committeeProxy, { id: "CommitteeGovernance" });

  // ── STEP 11 — WIRE ROLES ───────────────────────────────────────────────────
  const afterAll = { after: [committeeProxy] };

  // Core Access
  m.call(core, "grantRole", [ROLES.GOVERNANCE_ROLE, adminProxy], { id: "core_grantGovernanceRole", ...afterAll });
  m.call(core, "setBounty", [bountyProxy], { id: "core_setBounty", ...afterAll });
  m.call(core, "grantRole", [ROLES.COMMITTEE_ROLE, committeeProxy], { id: "core_grantCommitteeRole", ...afterAll });

  // Treasury Access
  m.call(treasury, "grantRole", [ROLES.CORE_ROLE, coreProxy], { id: "treasury_grantCoreRole", ...afterAll });
  m.call(treasury, "grantRole", [ROLES.BOUNTY_ROLE, bountyProxy], { id: "treasury_grantBountyRole", ...afterAll });

  // Reputation Access
  m.call(reputation, "grantRole", [ROLES.MINTER_ROLE, coreProxy], { id: "rep_grantMinterRole", ...afterAll });
  m.call(reputation, "grantRole", [ROLES.BURNER_ROLE, coreProxy], { id: "rep_grantBurnerRole", ...afterAll });
  m.call(reputation, "grantRole", [ROLES.LOCKER_ROLE, coreProxy], { id: "rep_grantLockerRole", ...afterAll });

  // NFTs
  m.call(donorNFT, "grantRole", [ROLES.MINTER_ROLE, coreProxy], { id: "donorNFT_grantMinterRole", ...afterAll });
  m.call(studentNFT, "grantRole", [ROLES.MINTER_ROLE, coreProxy], { id: "studentNFT_grantMinterRole", ...afterAll });

  // Committee Access (Bounty)
  m.call(bounty, "grantRole", [ROLES.RESOLVER_ROLE, committeeProxy], { id: "bounty_grantResolverRole", ...afterAll });

  return {
    usdc, donorNFT, studentNFT, reputation, treasury, milestoneManager, core, scholarshipAdmin, bounty, committee
  };
});