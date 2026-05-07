// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  BaseCredentialNFT
 * @author Scholarship Protocol
 * @notice Abstract base for soulbound ERC-721 credential tokens.
 *
 * @dev    Soulbound = transfers are blocked at the _update hook.
 *         Only mint (from zero) and burn (to zero) are permitted.
 *         One token per wallet per programId — prevents duplicate minting.
 *
 *         Non-upgradeable by design: credentials must be immutable.
 *         If the logic must change, deploy a new NFT contract and migrate.
 *
 * ROLES
 *   DEFAULT_ADMIN_ROLE – can grant/revoke MINTER_ROLE
 *   MINTER_ROLE        – ScholarshipCore (sole minter)
 */
abstract contract BaseCredentialNFT is ERC721URIStorage, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ── Storage ──────────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    /// @notice Prevents double-minting the same credential.
    mapping(address => mapping(uint256 => bool)) public hasMinted; // wallet -> pid -> status

    // ── Errors ───────────────────────────────────────────────────────────────

    error SoulboundCannotTransfer();
    error AlreadyMinted(address wallet, uint256 pid);

    // ── Constructor ──────────────────────────────────────────────────────────

    constructor(string memory name, string memory symbol)
        ERC721(name, symbol)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ── Soulbound enforcement ────────────────────────────────────────────────

    /**
     * @dev Called by OpenZeppelin ERC-721 before every token movement.
     *      Block any transfer that is not a mint or a burn.
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert SoulboundCannotTransfer();
        }
        return super._update(to, tokenId, auth);
    }

    // ── Minting ──────────────────────────────────────────────────────────────

    /**
     * @notice Mint one credential NFT.
     * @param recipient   Wallet to receive the token.
     * @param pid         Associated program (used for duplicate guard).
     * @param metadataURI IPFS URI for the token's JSON metadata.
     * @return tokenId    Newly minted token ID.
     */
    function mint(
        address recipient,
        uint256 pid,
        string calldata metadataURI
    ) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        if (hasMinted[recipient][pid])
            revert AlreadyMinted(recipient, pid);

        tokenId = _nextTokenId++;
        hasMinted[recipient][pid] = true;
        _mint(recipient, tokenId);
        _setTokenURI(tokenId, metadataURI);
    }

    // ── Interface resolution ─────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view virtual
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

// ════════════════════════════════════════════════════════════════════════════

/**
 * @title  DonorNFT
 * @notice Soulbound proof-of-contribution minted to donors.
 *         Issued the moment a donation is accepted; marks philanthropic
 *         involvement regardless of voting outcome.
 *
 *         Metadata should include: program title, donated amount, timestamp.
 */
contract DonorNFT is BaseCredentialNFT {
    constructor() BaseCredentialNFT("Scholarship Donor", "SDNFT") {}
}

// ════════════════════════════════════════════════════════════════════════════

/**
 * @title  StudentNFT
 * @notice Soulbound academic credential minted ONLY on full programme
 *         completion (all milestones approved without fraud).
 *
 *         Issuing only on full completion makes the credential meaningful —
 *         it cannot be obtained merely by being selected as a scholar.
 *
 *         Metadata should include: program, education level, completion date.
 */
contract StudentNFT is BaseCredentialNFT {
    constructor() BaseCredentialNFT("Scholarship Graduate", "SGNFT") {}
}

/**
 * @title  FraudNFT
 * @notice The "Scarlet Letter" of the protocol. Soulbound NFT minted to 
 *         scholars who commit HEAVY_FRAUD. 
 *         Permanent, non-transferable, and serves as a public warning.
 */
contract FraudNFT is BaseCredentialNFT {
    constructor() BaseCredentialNFT("Protocol Fraud Alert", "SCAM") {}
}
