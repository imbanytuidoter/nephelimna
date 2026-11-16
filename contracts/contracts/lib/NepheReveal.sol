// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {Angler} from "./NepheTypes.sol";

library NepheReveal {
    function request(Angler storage angler) internal {
        angler.pending = angler.score;
        angler.posting = true;
        FHE.makePubliclyDecryptable(angler.pending);
    }

    /// @dev The handle comes from storage, never from the caller, so a proof for any other
    /// ciphertext cannot be replayed as this total, and clearing `posting` makes it single use.
    function confirm(Angler storage angler, bytes calldata cleartexts, bytes calldata proof) internal returns (uint32 score) {
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = euint32.unwrap(angler.pending);
        FHE.checkSignatures(handles, cleartexts, proof);
        score = uint32(uint256(bytes32(cleartexts[0:32])));
        angler.posting = false;
        angler.posted = score;
        angler.postedAt = uint64(block.timestamp);
    }
}
