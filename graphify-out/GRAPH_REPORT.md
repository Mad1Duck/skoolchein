# Graph Report - .  (2026-11-12)

## Corpus Check
- 308 files · ~161,350 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1412 nodes · 2509 edges · 154 communities (89 shown, 65 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 132
- Community 136
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 148
- Community 153

## God Nodes (most connected - your core abstractions)
1. `useTxHook()` - 48 edges
2. `NeoButton()` - 37 edges
3. `Program` - 29 edges
4. `getTokenMeta()` - 26 edges
5. `compilerOptions` - 21 edges
6. `compilerOptions` - 19 edges
7. `compilerOptions` - 18 edges
8. `NeoModal()` - 17 edges
9. `v4Addresses` - 17 edges
10. `uploadToIPFS()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `scholarship-backend service` --implements--> `@ponder/client SQL-over-HTTP read path`  [INFERRED]
  docker-compose.yml → docs/ponder-backend-split-migration.md
- `HackQuest signed webhook flow` --semantically_similar_to--> `External Learning Bridge (HackQuest webhook)`  [INFERRED] [semantically similar]
  docs/course-integration-udemy-hackquest.md → changelog/4.0.1.md
- `Dual-mode voting (donation vs reputation)` --semantically_similar_to--> `Donor-weighted community voting`  [INFERRED] [semantically similar]
  changelog/4.0.6_Protocol_Sync_Voting.md → docs/scholarship-3000chars.md
- `ScholarshipMilestoneManagement.sol` --semantically_similar_to--> `Milestone-based funding`  [INFERRED] [semantically similar]
  packages/contract/README.md → docs/scholarship-3000chars.md
- `Backend README` --conceptually_related_to--> `scholarship-backend service`  [INFERRED]
  packages/backend/README.md → docker-compose.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deployment pipeline: workflow, compose, services** — github_workflows_deploy, docker_compose, docker_compose_scholarship_ponder, docker_compose_scholarship_backend, docker_compose_scholarship_frontend [EXTRACTED 1.00]
- **v4.0.x hardening and modularization releases** — changelog_4_0_2, changelog_4_0_3_protocol_hardening_final, changelog_4_0_4_indexer_modularization, changelog_4_0_5_frontend_modularization, changelog_4_0_6_protocol_sync_voting, changelog_v4_0_7_infrastructure_parity, changelog_v4_0_8_private_program_support [INFERRED 0.85]
- **Course completion verification flow** — docs_course_integration_udemy_hackquest_webhook, docs_course_integration_udemy_hackquest_sbt, docs_course_integration_udemy_hackquest_hybrid, changelog_4_0_1_external_learning_bridge [INFERRED 0.85]

## Communities (154 total, 65 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (51): committeeGovernanceAbi, fraudNFTAbi, milestoneManagerAbi, mockUSDCAbi, scholarshipAdminAbi, scholarshipBountyAbi, scholarshipPriceOracleAbi, scholarshipReputationAbi (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (28): committeeGovernanceAbi, milestoneManagerAbi, scholarshipBountyAbi, scholarshipCoreAbi, scholarshipPriceOracleAbi, scholarshipReputationAbi, scholarshipTreasuryAbi, chain (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (39): extends, ponder:internal, ponder:schema, applicationStatusEnum, disputeStatusEnum, disputeTypeEnum, indexedBlocks, milestoneStatusEnum (+31 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (39): eslint-config-ponder, dependencies, dotenv, drizzle-orm, hono, pino, pino-pretty, ponder (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (38): forge-std, hardhat, hardhat-verify, @nomicfoundation/hardhat-ignition, @nomicfoundation/hardhat-toolbox-viem, @nomiclabs/hardhat-etherscan, @openzeppelin/contracts, @openzeppelin/contracts-upgradeable (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (29): configMap, StatusType, PHASES, PhaseTimeline(), statusOrder, DashboardNftCollections(), DashboardNftCollectionsProps, queryKeys (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (28): NeoBadge(), shortenAddress(), WalletAvatar(), CommitteeScoreModal(), Props, BountyDisputeCard(), InitiatorProgramCard(), ActiveDisputeActions() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (29): ApplyPage(), useApplyProgram(), Route, Route, Route, Route, Route, Route (+21 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (23): NeoButton(), NeoButtonProps, Size, sizeStyles, Variant, variantStyles, NeoModal(), NeoModalProps (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (28): ConfidenceStakeModal(), Props, Step, CreateProgramModal(), Props, Step, ZERO_ADDRESS, DonateModal() (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (25): TokenRateContext, TokenRateContextType, TokenRateProvider(), TokenRateProviderProps, STATUS_STYLES, StatusBadge(), StatusBadgeProps, StatusType (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (22): DashboardCard(), DashboardMessageCard(), DashboardMessageCardProps, Props, ProviderProfileCard(), ProviderProfileCardProps, StudentProfileCard(), StudentProfileCardProps (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (29): compilerOptions, allowSyntheticDefaultImports, baseUrl, esModuleInterop, isolatedModules, lib, module, moduleDetection (+21 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (28): compilerOptions, allowImportingTsExtensions, baseUrl, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+20 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (17): env, GeminiService, ProgramFitResponse, Injectable, Singleton, HealthController, NOTE: return a plain object, never `c.json(...)`. hono-forge's route, ApiDoc (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (10): ProgramsController, NOTE: handlers return plain objects, never `c.json(...)`. hono-forge's, ApiDoc, ApiTags, Controller, Get, Injectable, ProgramsService (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (20): react, Button(), ButtonProps, Large, Primary, Secondary, Small, Story (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (17): NeoSkeleton(), CommitteeProgramSection(), ResolveShortlistForProgram(), SelectWinnersForProgram(), fmtAmount(), OverviewTab(), ProgramDetailPage(), SelectWinnersForProgram() (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (19): colorMap, StatCard(), StatCardProps, DashboardTabs(), DashboardTabsContent(), DashboardTabsList(), DashboardTabsTrigger(), TabsContext (+11 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (13): db, pool, v4ExternalLearning, LearningController, ApiDoc, ApiTags, Controller, Get (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (14): IpfsController, ApiDoc, ApiTags, Controller, Injectable, Post, IMetadata, IpfsService (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (21): compilerOptions, allowSyntheticDefaultImports, baseUrl, esModuleInterop, jsx, jsxImportSource, lib, module (+13 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+12 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (12): Header(), navItems, Dialog(), ProgramTabs(), ProgramTabsProps, Tab, Breakpoint, breakpointOrder (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (19): ESNext, compilerOptions, allowImportingTsExtensions, allowJs, jsx, lib, module, moduleDetection (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (16): abiExports, abis, ARTIFACT_ROOT, CHAIN_DIR, CONTRACT_MAP, DEPLOYMENTS_ENV, __dirname, ENV_KEY_MAP (+8 more)

### Community 26 - "Community 26"
Cohesion: 0.15
Nodes (10): TokensController, ApiDoc, ApiTags, Controller, Get, Injectable, NOTE: priceUsd carries 8 decimals (Chainlink convention) and is, TokensService (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.18
Nodes (12): accentNotch, fillColors, NeoCard(), NeoCardBody(), NeoCardFooter(), NeoCardProps, scholarshipCoreAbi, fillByStatus (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (11): SplitText(), SplitTextProps, messages, ProgramsPage(), TABS, Title, VotePage(), usePrograms() (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (15): devDependencies, @types/bun, @types/bun, typescript, module, name, overrides, drizzle-orm (+7 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (9): MilestonesController, ApiDoc, ApiTags, Controller, Get, Injectable, MilestonesService, Injectable (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (15): check-disk-space, lodash, dependencies, check-disk-space, dotenv, drizzle-orm, lodash, pg (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (9): ApplicantsController, ApiDoc, ApiTags, Controller, Get, Injectable, ApplicantsService, Injectable (+1 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (9): DisputesController, ApiDoc, ApiTags, Controller, Get, Injectable, DisputesService, Injectable (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.17
Nodes (9): ScholarsController, ApiDoc, ApiTags, Controller, Get, Injectable, ScholarsService, Injectable (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.17
Nodes (9): ApiDoc, ApiTags, Controller, Get, Injectable, VotesController, Injectable, Singleton (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.21
Nodes (10): mobius, typeDefs, milestoneQueries, milestoneSchema, programQueries, programSchema, studentQueries, studentSchema (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.18
Nodes (9): AdminController, ApiDoc, ApiTags, Controller, Get, Injectable, AdminService, Injectable (+1 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (9): DashboardController, ApiDoc, ApiTags, Controller, Get, Injectable, DashboardService, Injectable (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (9): ReputationController, ApiDoc, ApiTags, Controller, Get, Injectable, ReputationService, Injectable (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.17
Nodes (10): ApiDoc, ApiTags, Controller, Injectable, Post, Public, WebhooksController, Injectable (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.21
Nodes (7): SseController, ApiDoc, ApiTags, Controller, Get, Post, Sse

### Community 42 - "Community 42"
Cohesion: 0.20
Nodes (3): appStateInjection, LState, createInjection()

### Community 43 - "Community 43"
Cohesion: 0.18
Nodes (11): axios, dagre, dependencies, axios, dagre, @tanstack/react-query, wagmi, zod (+3 more)

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (11): drizzle-kit, devDependencies, drizzle-kit, @types/bun, @types/lodash, @types/pg, typescript, @types/bun (+3 more)

### Community 45 - "Community 45"
Cohesion: 0.29
Nodes (10): docker-compose.yml (skoolcein stack), scholarship-backend service, scholarship-frontend service, scholarship-ponder service, Deploy to VPS Workflow, Deploy Contracts Workflow, scholarship-v4 Ignition module deploy, sync-deployments.ts (.deployments.env) (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.27
Nodes (4): ComingSoon(), Timeline(), TimelineItem, TimelineProps

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (8): ScholarCard(), ProviderMilestonesPanel(), ProviderMilestonesPanelProps, Props, useExternalProgress(), Milestone, useExecuteMilestone(), formatTokenWithSymbol()

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (8): Props, Step, VoteModal(), CandidateCard(), CandidateCardProps, useReputation(), useVoteForCandidate(), fetchApplicantProfile()

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (8): Scholarship Protocol pitch (3000 chars), Milestone-based funding, Contract README (legacy ScholarshipManager docs), ScholarshipApplicantManagement.sol, ScholarshipBatchManagement.sol, ScholarshipDonaterNFT.sol, ScholarshipMilestoneManagement.sol, ScholarshipManager.sol

### Community 50 - "Community 50"
Cohesion: 0.32
Nodes (4): Button(), ButtonProps, getButtonClasses(), Props

### Community 51 - "Community 51"
Cohesion: 0.29
Nodes (7): elysia, devDependencies, elysia, eslint, @types/react, eslint, @types/react

### Community 52 - "Community 52"
Cohesion: 0.29
Nodes (7): scripts, db:generate, db:migrate, db:push, db:studio, dev, start

### Community 54 - "Community 54"
Cohesion: 0.29
Nodes (7): scripts, build, build-storybook, dev, lint, preview, storybook

### Community 56 - "Community 56"
Cohesion: 0.33
Nodes (6): v4.0.4 Indexer Modularization, Ponder handlers/v4 modules (core, milestones, bounty, governance, treasury), v4.0.5 Frontend Modularization, Modular v4 contract hooks (write-hooks bridge), v4.0.7 Infrastructure Parity and Hook Restoration, Features deferred to v5.0.0 (Aave yield, DAO reputation)

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (6): Migration Plan: Split Ponder REST API into packages/backend, hono-forge controller/service pattern, @ponder/client SQL-over-HTTP read path, Schema ownership: onchainTable in ponder.schema.ts, Table Ownership Matrix (17 tables), v4_external_learning table (backend-owned)

### Community 58 - "Community 58"
Cohesion: 0.60
Nodes (4): ApproachableWrapper(), mouseLeave(), mouseMove(), useApproachable()

### Community 59 - "Community 59"
Cohesion: 0.60
Nodes (4): ApproachableWrapper(), mouseLeave(), mouseMove(), useApproachable()

### Community 60 - "Community 60"
Cohesion: 0.40
Nodes (5): v4.0.1 External Learning Bridge and Public Participation, External Learning Bridge (HackQuest webhook), v4.0.2 Gas and Security Optimizations, v4.0.3 Final Protocol Hardening checklist, HackQuest signed webhook flow

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (5): openDonation master switch, v4.0.6 Protocol Sync (Voting and Staking), Dual-mode voting (donation vs reputation), Private program bypass of voting, Donor-weighted community voting

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (5): v4.0.3 Industrial Hardening (Final Phase), Anti-griefing 2x stake for late disputes, resolveShortlistBatch batch resolution, Financial packing (uint48/uint32), Commit-reveal decentralized arbitration

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (5): v4.0.8 Private Program Support and Batching, Move admin logic to ScholarshipAdmin (EIP-170 24KB limit), Course Platform Integration: Udemy and HackQuest, Hybrid webhook plus SBT architecture, On-chain SBT course credential verification

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 65 - "Community 65"
Cohesion: 0.40
Nodes (4): compilerOptions, paths, files, references

### Community 66 - "Community 66"
Cohesion: 0.50
Nodes (3): name, private, type

### Community 67 - "Community 67"
Cohesion: 0.50
Nodes (3): __dirname, __filename, publicDir

### Community 68 - "Community 68"
Cohesion: 0.50
Nodes (3): CHAIN_DIR, __dirname, ROOT

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (3): Input, InputProps, Option

### Community 70 - "Community 70"
Cohesion: 0.50
Nodes (4): DisputesPage(), formatShort(), useDisputes(), useMilestones()

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (3): Frontend PM2 Deploy Workflow, Frontend index.html (Skoolcein), Frontend README (React + TS + Vite template)

## Knowledge Gaps
- **449 isolated node(s):** `graphify`, `name`, `module`, `type`, `private` (+444 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **65 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ponder` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `NeoButton()` connect `Community 8` to `Community 0`, `Community 5`, `Community 6`, `Community 9`, `Community 42`, `Community 11`, `Community 10`, `Community 47`, `Community 48`, `Community 17`, `Community 18`, `Community 23`, `Community 27`, `Community 28`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 43` to `Community 16`, `Community 64`, `Community 84`, `Community 85`, `Community 87`, `Community 96`, `Community 97`, `Community 98`, `Community 99`, `Community 100`, `Community 101`, `Community 102`, `Community 103`, `Community 104`, `Community 105`, `Community 106`, `Community 107`, `Community 108`, `Community 109`, `Community 110`, `Community 111`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `graphify`, `name`, `module` to the rest of the system?**
  _449 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06490384615384616 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11428571428571428 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._