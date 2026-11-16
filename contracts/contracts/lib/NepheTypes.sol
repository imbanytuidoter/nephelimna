// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ebool, euint8, euint16, euint32} from "@fhevm/solidity/lib/FHE.sol";

uint8 constant SIZE = 8;
uint8 constant CELLS = 64;
uint8 constant MAX_SEATS = 10;
uint8 constant TIDES = 3;
uint8 constant CASTS_PER_TIDE = 6;
uint8 constant GENERATE_BATCH = 6;
uint8 constant LAYER_BITS = 5;
uint8 constant NO_SEAT = 255;

enum Stage {
    None,
    Lobby,
    Fishing,
    Finished,
    Revealing,
    Revealed
}

struct Round {
    Stage stage;
    uint8 seats;
    uint8 generated;
    uint8 tide;
    bool leviathanPlaced;
    address[10] players;
    address[10] sessions;
    uint8[10] castsLeft;
    uint8[10] netsTide;
    euint16[64] cells;
    ebool[64] hot;
    euint8 levPos;
    ebool levCaught;
    euint8[2][10] nets;
    euint32[10] scores;
    euint8[10] lastCatch;
    ebool[10] lastRareNear;
    ebool[10] lastLevNear;
    ebool[10] lastSnagged;
    uint32[10] finalScores;
}
