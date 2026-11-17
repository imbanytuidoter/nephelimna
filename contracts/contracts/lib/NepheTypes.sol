// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ebool, euint8, euint16, euint32} from "@fhevm/solidity/lib/FHE.sol";

uint8 constant SIZE = 8;
uint8 constant CELLS = 64;
uint8 constant GENERATE_BATCH = 6;
uint8 constant LAYER_BITS = 5;
uint8 constant NET_SLOTS = 8;
uint8 constant NETS_PER_PLAYER = 2;
uint64 constant NET_LIFETIME = 1 hours;
uint8 constant NAME_BYTES = 64;
uint8 constant NO_SLOT = 255;
uint32 constant CASTS_PER_NET = 3;

struct Angler {
    address session;
    uint32 casts;
    bool posting;
    uint32 posted;
    uint64 postedAt;
    uint32 castsAtPost;
    uint32 castsAtNet;
    euint32 score;
    euint32 pending;
    euint8 lastCatch;
    ebool lastRareNear;
    ebool lastLevNear;
    ebool lastSnagged;
}

struct Net {
    address owner;
    uint64 until;
    euint8 cell;
}

struct Sea {
    uint8 generated;
    euint16[64] cells;
    ebool[64] hot;
    euint8 levPos;
    Net[8] nets;
    mapping(address => Angler) anglers;
    mapping(address => address) playerOf;
}
