// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

contract Witness {
    address public immutable owner;
    uint256 public value;
    event ValueChanged(address indexed author, uint256 previousValue, uint256 newValue);
    constructor() { owner = msg.sender; }
    function setValue(uint256 nextValue) external {
        require(msg.sender == owner, "not owner");
        uint256 previous = value;
        value = nextValue;
        emit ValueChanged(msg.sender, previous, nextValue);
    }
    function alwaysRevert() external pure { revert("witness revert"); }
}
