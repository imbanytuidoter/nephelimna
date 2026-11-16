// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint32, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Round, Stage, CELLS, MAX_SEATS, TIDES, CASTS_PER_TIDE, GENERATE_BATCH, NO_SEAT} from "./lib/NepheTypes.sol";
import {NepheLake} from "./lib/NepheLake.sol";
import {NepheCast} from "./lib/NepheCast.sol";
import {NepheTraps} from "./lib/NepheTraps.sol";
import {NepheReveal} from "./lib/NepheReveal.sol";

contract NepheTable is ZamaEthereumConfig {
    address public immutable keeper;
    uint32 public roundCount;
    mapping(uint32 => Round) internal _rounds;
    mapping(uint32 => mapping(address => uint8)) internal _seatOf;
    mapping(uint32 => mapping(address => bool)) internal _sessionUsed;
    mapping(uint32 => bool) public lakeOpened;

    event RoundOpened(uint32 indexed round);
    event Joined(uint32 indexed round, uint8 seat, address player, address session);
    event LakeFilled(uint32 indexed round, uint8 generated);
    event RoundStarted(uint32 indexed round, uint8 seats);
    event NetsSet(uint32 indexed round, uint8 seat, uint8 tide);
    event CastMade(uint32 indexed round, uint8 seat, uint8 cell, uint8 tide);
    event TideTurned(uint32 indexed round, uint8 tide);
    event RoundFinished(uint32 indexed round);
    event ScoresRequested(uint32 indexed round);
    event ScoresRevealed(uint32 indexed round, uint32[] scores);
    event LakeOpened(uint32 indexed round);

    error NotKeeper();
    error WrongStage();
    error TableFull();
    error AlreadySeated();
    error SessionTaken();
    error ZeroSession();
    error NotSession();
    error BadSeat();
    error BadCell();
    error BadBatch();
    error LakeNotReady();
    error NoPlayers();
    error NoCastsLeft();
    error NetsAlreadySet();

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert NotKeeper();
        _;
    }

    constructor(address keeper_) {
        keeper = keeper_;
    }

    function openRound() external onlyKeeper returns (uint32 id) {
        id = ++roundCount;
        _rounds[id].stage = Stage.Lobby;
        emit RoundOpened(id);
    }

    function join(uint32 id, address session) external {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Lobby) revert WrongStage();
        if (session == address(0)) revert ZeroSession();
        if (round.seats == MAX_SEATS) revert TableFull();
        if (_seatOf[id][msg.sender] != 0) revert AlreadySeated();
        if (_sessionUsed[id][session]) revert SessionTaken();
        uint8 seat = round.seats++;
        round.players[seat] = msg.sender;
        round.sessions[seat] = session;
        round.scores[seat] = FHE.asEuint32(0);
        FHE.allowThis(round.scores[seat]);
        _seatOf[id][msg.sender] = seat + 1;
        _sessionUsed[id][session] = true;
        emit Joined(id, seat, msg.sender, session);
    }

    function fillLake(uint32 id, uint8 count) external onlyKeeper {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Lobby) revert WrongStage();
        if (count == 0 || count > GENERATE_BATCH || uint16(round.generated) + count > CELLS) revert BadBatch();
        NepheLake.generate(round, count);
        emit LakeFilled(id, round.generated);
    }

    function startRound(uint32 id) external onlyKeeper {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Lobby) revert WrongStage();
        if (round.generated != CELLS) revert LakeNotReady();
        if (round.seats == 0) revert NoPlayers();
        NepheLake.placeLeviathan(round);
        round.leviathanPlaced = true;
        round.stage = Stage.Fishing;
        round.tide = 1;
        for (uint8 s = 0; s < round.seats; s++) round.castsLeft[s] = CASTS_PER_TIDE;
        emit RoundStarted(id, round.seats);
        emit TideTurned(id, 1);
    }

    function setNets(uint32 id, uint8 seat, externalEuint8 a, externalEuint8 b, bytes calldata proof) external {
        Round storage round = _fishing(id, seat);
        if (round.netsTide[seat] == round.tide) revert NetsAlreadySet();
        NepheTraps.set(round, seat, FHE.fromExternal(a, proof), FHE.fromExternal(b, proof));
        emit NetsSet(id, seat, round.tide);
    }

    function cast(uint32 id, uint8 seat, uint8 cell, externalEuint8 choice, bytes calldata proof) external {
        Round storage round = _fishing(id, seat);
        if (cell >= CELLS) revert BadCell();
        if (round.castsLeft[seat] == 0) revert NoCastsLeft();
        round.castsLeft[seat]--;
        NepheCast.resolve(round, seat, cell, FHE.fromExternal(choice, proof), msg.sender);
        emit CastMade(id, seat, cell, round.tide);
    }

    function turnTide(uint32 id) external onlyKeeper {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Fishing) revert WrongStage();
        if (round.tide == TIDES) {
            round.stage = Stage.Finished;
            emit RoundFinished(id);
            return;
        }
        round.tide++;
        for (uint8 s = 0; s < round.seats; s++) round.castsLeft[s] = CASTS_PER_TIDE;
        emit TideTurned(id, round.tide);
    }

    function requestScores(uint32 id) external {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Finished) revert WrongStage();
        round.stage = Stage.Revealing;
        NepheReveal.openScores(round);
        emit ScoresRequested(id);
    }

    function revealScores(uint32 id, bytes calldata cleartexts, bytes calldata proof) external {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Revealing) revert WrongStage();
        round.stage = Stage.Revealed;
        emit ScoresRevealed(id, NepheReveal.checkScores(round, cleartexts, proof));
    }

    function openLake(uint32 id) external {
        Round storage round = _rounds[id];
        if (round.stage != Stage.Revealed) revert WrongStage();
        if (lakeOpened[id]) revert WrongStage();
        lakeOpened[id] = true;
        NepheReveal.openLake(round, 0, CELLS);
        NepheReveal.openLeviathan(round);
        emit LakeOpened(id);
    }

    function roundInfo(uint32 id) external view returns (Stage stage, uint8 seats, uint8 generated, uint8 tide) {
        Round storage round = _rounds[id];
        return (round.stage, round.seats, round.generated, round.tide);
    }

    function seatInfo(uint32 id, uint8 seat) external view returns (address player, address session, uint8 castsLeft, bool netsSet, uint32 finalScore) {
        Round storage round = _rounds[id];
        return (round.players[seat], round.sessions[seat], round.castsLeft[seat], round.netsTide[seat] == round.tide && round.tide != 0, round.finalScores[seat]);
    }

    function seatOf(uint32 id, address player) external view returns (uint8) {
        uint8 stored = _seatOf[id][player];
        return stored == 0 ? NO_SEAT : stored - 1;
    }

    function castResult(uint32 id, uint8 seat) external view returns (euint8 weight, ebool rareNear, ebool levNear, ebool snagged) {
        Round storage round = _rounds[id];
        return (round.lastCatch[seat], round.lastRareNear[seat], round.lastLevNear[seat], round.lastSnagged[seat]);
    }

    function scoreHandle(uint32 id, uint8 seat) external view returns (euint32) {
        return _rounds[id].scores[seat];
    }

    function cellHandle(uint32 id, uint8 cell) external view returns (euint16) {
        return _rounds[id].cells[cell];
    }

    function leviathanHandle(uint32 id) external view returns (euint8) {
        return _rounds[id].levPos;
    }

    function _fishing(uint32 id, uint8 seat) internal view returns (Round storage round) {
        round = _rounds[id];
        if (round.stage != Stage.Fishing) revert WrongStage();
        if (seat >= round.seats) revert BadSeat();
        if (round.sessions[seat] != msg.sender) revert NotSession();
    }
}
