// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Sea, Angler, CELLS, GENERATE_BATCH, NETS_PER_PLAYER, NAME_BYTES, NO_SLOT, CASTS_PER_NET} from "./lib/NepheTypes.sol";
import {NepheLake} from "./lib/NepheLake.sol";
import {NepheCast} from "./lib/NepheCast.sol";
import {NepheTraps} from "./lib/NepheTraps.sol";
import {NepheReveal} from "./lib/NepheReveal.sol";

contract NepheSea is ZamaEthereumConfig {
    address public immutable keeper;
    Sea internal _sea;

    event SeaFilled(uint8 generated);
    event Joined(address indexed player, address session);
    event CastMade(address indexed player, uint8 cell);
    event NetSet(address indexed player, uint8 slot, uint64 until);
    event ScorePostRequested(address indexed player, string name);
    event ScorePosted(address indexed player, uint32 score);

    error NotKeeper();
    error BadBatch();
    error SeaNotReady();
    error AlreadyJoined();
    error SessionTaken();
    error ZeroSession();
    error NotSession();
    error BadCell();
    error TooManyNets();
    error NetsFull();
    error NameTooLong();
    error AlreadyPosting();
    error NothingToPost();
    error BadConsent();
    error NothingNewToPost();
    error NeedMoreCasts();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(address keeper_) {
        keeper = keeper_;
    }

    function fillSea(uint8 count) external onlyKeeper {
        if (count == 0 || count > GENERATE_BATCH || uint16(_sea.generated) + count > CELLS) revert BadBatch();
        NepheLake.generate(_sea, count);
        if (_sea.generated == CELLS) NepheLake.placeLeviathan(_sea);
        emit SeaFilled(_sea.generated);
    }

    /// @dev Anyone could otherwise bind a stranger's session key first and lock its owner out,
    /// so a session other than the caller has to sign this contract, chain and player.
    function join(address session, bytes calldata consent) external {
        if (session == address(0)) revert ZeroSession();
        if (session != msg.sender && _signer(msg.sender, consent) != session) revert BadConsent();
        Angler storage angler = _sea.anglers[msg.sender];
        if (angler.session != address(0)) revert AlreadyJoined();
        if (_sea.playerOf[session] != address(0)) revert SessionTaken();
        angler.session = session;
        _sea.playerOf[session] = msg.sender;
        angler.score = FHE.asEuint32(0);
        NepheTraps.shareScore(angler, msg.sender);
        emit Joined(msg.sender, session);
    }

    function cast(uint8 cell, externalEuint8 choice, bytes calldata proof) external {
        address player = _player();
        if (_sea.generated < CELLS) revert SeaNotReady();
        if (cell >= CELLS) revert BadCell();
        _sea.anglers[player].casts++;
        NepheCast.resolve(_sea, player, cell, FHE.fromExternal(choice, proof), msg.sender);
        emit CastMade(player, cell);
    }

    function setNet(externalEuint8 cell, bytes calldata proof) external {
        address player = _player();
        Angler storage angler = _sea.anglers[player];
        if (angler.casts < angler.castsAtNet + CASTS_PER_NET) revert NeedMoreCasts();
        angler.castsAtNet = angler.casts;
        (uint8 slot, uint8 owned) = NepheTraps.scan(_sea, player);
        if (owned >= NETS_PER_PLAYER) revert TooManyNets();
        if (slot == NO_SLOT) revert NetsFull();
        uint64 until = NepheTraps.set(_sea, slot, player, FHE.fromExternal(cell, proof));
        emit NetSet(player, slot, until);
    }

    function postScore(string calldata name) external {
        address player = _player();
        if (bytes(name).length > NAME_BYTES) revert NameTooLong();
        Angler storage angler = _sea.anglers[player];
        if (angler.posting) revert AlreadyPosting();
        if (angler.casts == angler.castsAtPost) revert NothingNewToPost();
        angler.castsAtPost = angler.casts;
        NepheReveal.request(angler);
        emit ScorePostRequested(player, name);
    }

    function confirmScore(address player, bytes calldata cleartexts, bytes calldata proof) external onlyKeeper {
        Angler storage angler = _sea.anglers[player];
        if (!angler.posting) revert NothingToPost();
        emit ScorePosted(player, NepheReveal.confirm(angler, cleartexts, proof));
    }

    function generated() external view returns (uint8) {
        return _sea.generated;
    }

    function playerOf(address session) external view returns (address) {
        return _sea.playerOf[session];
    }

    function anglerInfo(address player) external view returns (address session, uint32 casts, bool posting, uint32 posted, uint64 postedAt) {
        Angler storage angler = _sea.anglers[player];
        return (angler.session, angler.casts, angler.posting, angler.posted, angler.postedAt);
    }

    function gates(address player) external view returns (uint32 casts, uint32 castsAtPost, uint32 castsAtNet) {
        Angler storage angler = _sea.anglers[player];
        return (angler.casts, angler.castsAtPost, angler.castsAtNet);
    }

    function castResult(address player) external view returns (euint8 weight, ebool rareNear, ebool levNear, ebool snagged) {
        Angler storage angler = _sea.anglers[player];
        return (angler.lastCatch, angler.lastRareNear, angler.lastLevNear, angler.lastSnagged);
    }

    function scoreHandle(address player) external view returns (euint32) {
        return _sea.anglers[player].score;
    }

    function postHandle(address player) external view returns (euint32) {
        return _sea.anglers[player].pending;
    }

    function netInfo(uint8 slot) external view returns (address owner, uint64 until) {
        return (_sea.nets[slot].owner, _sea.nets[slot].until);
    }

    function cellHandle(uint8 cell) external view returns (euint16) {
        return _sea.cells[cell];
    }

    function leviathanHandle() external view returns (euint8) {
        return _sea.levPos;
    }

    function joinDigest(address player) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode("nephelimna join", address(this), block.chainid, player))));
    }

    function _signer(address player, bytes calldata consent) internal view returns (address) {
        if (consent.length != 65) return address(0);
        bytes32 r = bytes32(consent[0:32]);
        bytes32 s = bytes32(consent[32:64]);
        uint8 v = uint8(consent[64]);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(joinDigest(player), v, r, s);
    }

    function _player() internal view returns (address player) {
        player = _sea.playerOf[msg.sender];
        if (player == address(0)) revert NotSession();
    }
}
