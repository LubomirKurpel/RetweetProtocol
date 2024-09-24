// yarn hardhat test test/offline_tests.js

const {
	expect
} = require("chai");
const {
	ethers
} = require("hardhat");
const {
	utils,
	BigNumber
} = require('ethers');
const fs = require("fs");

const {
	constants
} = require('@openzeppelin/test-helpers');

require.extensions['.txt'] = function(module, filename) {
	module.exports = fs.readFileSync(filename, 'utf8');
};

describe("Offline tests", function() {

	let owner,
		manager,
		oracle,
		randomPerson,
		randomPerson_2,
		randomPerson_3;

	let ETH_Decimals = 18;

	let USDC_ContractFactory,
		USDC_Contract,
		USDC_Decimals = 6;

	let USDT_ContractFactory,
		USDT_Contract,
		USDT_Decimals = 6;

	let RetweetToken_ContractFactory,
		RetweetToken_Contract;

	let RetweetProtocol_ContractFactory,
		RetweetProtocol_Contract;

	beforeEach(async function() {

		[
			owner,
			manager,
			oracle,
			treasury,
			randomPerson,
			randomPerson_2,
			randomPerson_3
		] = await hre.ethers.getSigners();

		// 1. Deploy USDC
		USDC_ContractFactory = await hre.ethers.getContractFactory("USDC");
		USDC_Contract = await USDC_ContractFactory.deploy();
		await USDC_Contract.deployed();
		console.log("USDC ERC-20 contract deployed to:", USDC_Contract.address);

		// 2. Deploy USDT
		USDT_ContractFactory = await hre.ethers.getContractFactory("USDT");
		USDT_Contract = await USDT_ContractFactory.deploy();
		await USDT_Contract.deployed();
		console.log("USDT ERC-20 contract deployed to:", USDT_Contract.address);

		// 3. Deploy Retweet Token
		RetweetToken_ContractFactory = await hre.ethers.getContractFactory("RetweetToken");
		RetweetToken_Contract = await RetweetToken_ContractFactory.deploy();
		await RetweetToken_Contract.deployed();
		console.log("Retweet ERC-20 Token contract deployed to:", RetweetToken_Contract.address);

		// 4. Deploy Retweet Protocol
		RetweetProtocol_ContractFactory = await hre.ethers.getContractFactory("RetweetProtocolV1");
		/*
		contract RetweetProtocolV1 ...
			constructor(
				address _USDC,
				address _USDT,
				address _RetweetToken,
				address _manager,
				address _oracle
			)
		*/
		RetweetProtocol_Contract = await RetweetProtocol_ContractFactory.deploy(
			USDC_Contract.address,
			USDT_Contract.address,
			RetweetToken_Contract.address,
			manager.address,
			oracle.address
		);
		await RetweetProtocol_Contract.deployed();
		console.log("Retweet Protocol contract deployed to:", RetweetProtocol_Contract.address);

	});



	it("Should test adding bounty by randomPerson with ETH", async function() {

		// Get initial balance of randomPerson
		let initialBalance = await ethers.provider.getBalance(randomPerson.address);
		console.log("Initial balance:", ethers.utils.formatEther(initialBalance)); // Should be around 10000 ETH

		// Add bounty of 100 ETH + lockup period 1 day
		const tx = await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1, // NID or unique ID
			constants.ZERO_ADDRESS, // 0x0 address to denote ETH
			ethers.utils.parseEther("100"), // 100 ETH as bounty amount
			86400, // 1 day in seconds
			{
				value: ethers.utils.parseEther("100")
			} // 100 ETH sent to the transaction
		);

		// Wait for the transaction to be mined
		const receipt = await tx.wait();

		// Get gas used in the transaction
		const gasUsed = receipt.gasUsed;
		const gasPrice = tx.gasPrice;
		const gasCost = gasUsed.mul(gasPrice);

		// Get balance after the bounty was created
		let finalBalance = await ethers.provider.getBalance(randomPerson.address);
		console.log("Final balance:", ethers.utils.formatEther(finalBalance));

		// Check the final balance after deducting bounty amount + gas fees
		const expectedBalance = initialBalance.sub(ethers.utils.parseEther("100")).sub(gasCost);

		// Log the expected balance for debugging purposes
		console.log("Expected balance after bounty creation and gas fees:", ethers.utils.formatEther(expectedBalance));

		// Assert that final balance matches expected balance
		expect(finalBalance).to.be.closeTo(expectedBalance, ethers.utils.parseEther("0.01")); // Allow a small margin for gas fee variations
	});

	it("Should test adding bounty by randomPerson with USDC", async function() {
		// Mint 1000 USDC for randomPerson (adjusted for decimals)
		await USDC_Contract.connect(randomPerson).mintTokens("1000");

		// Get and log balance of USDC of randomPerson before the transaction
		let initialBalance = await USDC_Contract.balanceOf(randomPerson.address);
		console.log("Initial USDC balance of RandomPerson: " + initialBalance.toString());

		// Approve Retweet Protocol contract to spend 100 USDC from randomPerson's address
		await USDC_Contract.connect(randomPerson).approve(
			RetweetProtocol_Contract.address, // RetweetProtocol contract address
			ethers.utils.parseUnits("100", USDC_Decimals) // Approve 100 USDC (with correct decimals)
		);

		// Verify approval was successful by checking the allowance
		let allowance = await USDC_Contract.allowance(randomPerson.address, RetweetProtocol_Contract.address);
		console.log("USDC allowance for RetweetProtocol:", allowance.toString());
		expect(allowance).to.equal(ethers.utils.parseUnits("100", USDC_Decimals));

		// Add bounty of 100 USDC + lockup period of 1 day
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1, // NID or unique ID
			USDC_Contract.address, // USDC token address
			ethers.utils.parseUnits("100", USDC_Decimals), // 100 USDC as bounty amount (adjusted for decimals)
			86400 // Lockup period of 1 day (in seconds)
		);

		// Get the latest bounty ID
		let latestBountyID = await RetweetProtocol_Contract.bountyCounter();
		console.log("Latest bounty ID:", latestBountyID.toString());

		// Get and log balance of USDC of randomPerson after the transaction
		let finalBalance = await USDC_Contract.balanceOf(randomPerson.address);
		console.log("Final USDC balance of RandomPerson: " + finalBalance.toString());

		// Expected balance after sending 100 USDC (1000 - 100 = 900 USDC)
		let expectedBalance = ethers.utils.parseUnits("900", USDC_Decimals);
		console.log("Expected balance after bounty creation: " + expectedBalance.toString());

		// Check balance after bounty creation
		expect(finalBalance).to.equal(expectedBalance);
	});


	it("Should test adding a bounty with USDC", async function() {
		await USDC_Contract.connect(randomPerson).mintTokens(1000 * 10 ** USDC_Decimals);
		await USDC_Contract.connect(randomPerson).approve(RetweetProtocol_Contract.address, 100 * 10 ** USDC_Decimals);

		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			USDC_Contract.address,
			100 * 10 ** USDC_Decimals,
			86400
		);

		let latestBountyID = await RetweetProtocol_Contract.bountyCounter();
		expect(latestBountyID).to.equal(1);
	});

	it("Should test adding a bounty with ETH", async function() {
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			constants.ZERO_ADDRESS,
			ethers.utils.parseEther("100"),
			86400, {
				value: ethers.utils.parseEther("100")
			}
		);

		let latestBountyID = await RetweetProtocol_Contract.bountyCounter();
		expect(latestBountyID).to.equal(1);
	});

	it("Should test adding a bounty with RetweetToken", async function() {
		// Mint 1000 RetweetTokens for randomPerson
		await RetweetToken_Contract.connect(randomPerson).mintTokens(ethers.utils.parseUnits("1000", 18));

		// Approve RetweetProtocol to spend 100 RetweetTokens
		await RetweetToken_Contract.connect(randomPerson).approve(RetweetProtocol_Contract.address, ethers.utils.parseUnits("100", 18));

		// Add bounty with 100 RetweetTokens and a lockup period of 1 day
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1, // NID or unique ID
			RetweetToken_Contract.address, // RetweetToken address
			ethers.utils.parseUnits("100", 18), // 100 RetweetTokens (with proper decimals)
			86400 // Lockup period of 1 day (in seconds)
		);

		let latestBountyID = await RetweetProtocol_Contract.bountyCounter();
		expect(latestBountyID).to.equal(1);
	});

	it("Should not allow reclaiming contribution if bounty is released", async function() {
		await USDC_Contract.connect(randomPerson).mintTokens(1000 * 10 ** USDC_Decimals);
		await USDC_Contract.connect(randomPerson).approve(RetweetProtocol_Contract.address, 100 * 10 ** USDC_Decimals);

		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			USDC_Contract.address,
			100 * 10 ** USDC_Decimals,
			86400
		);

		await RetweetProtocol_Contract.connect(oracle).releaseBounty(1, randomPerson_2.address);

		await expect(
			RetweetProtocol_Contract.connect(randomPerson).reclaimContribution(1)
		).to.be.revertedWith("Bounty already released");
	});

	it("Should allow Oracle to start the lockup period", async function() {
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			constants.ZERO_ADDRESS,
			ethers.utils.parseEther("100"),
			86400, {
				value: ethers.utils.parseEther("100")
			}
		);

		await RetweetProtocol_Contract.connect(oracle).startLockup(1);
		let bounty = await RetweetProtocol_Contract.bounties(1);
		expect(bounty.lockupEnd).to.be.gt(0);
	});

	it("Should allow Oracle to release the bounty after lockup", async function() {
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			constants.ZERO_ADDRESS,
			ethers.utils.parseEther("100"),
			86400, {
				value: ethers.utils.parseEther("100")
			}
		);

		await RetweetProtocol_Contract.connect(oracle).startLockup(1);

		// Simulate time passing (1 day)
		await ethers.provider.send("evm_increaseTime", [86400]);
		await ethers.provider.send("evm_mine", []);

		await RetweetProtocol_Contract.connect(oracle).releaseBounty(1, randomPerson_2.address);
		let bounty = await RetweetProtocol_Contract.bounties(1);
		expect(bounty.isReleased).to.be.true;
		expect(bounty.recipient).to.equal(randomPerson_2.address);
	});
	it("Should allow contributors to reclaim their contribution after lockup if not released", async function() {
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			constants.ZERO_ADDRESS,
			ethers.utils.parseEther("100"),
			86400, {
				value: ethers.utils.parseEther("100")
			}
		);

		await RetweetProtocol_Contract.connect(oracle).startLockup(1);

		// Simulate time passing (1 day)
		await ethers.provider.send("evm_increaseTime", [86400]);
		await ethers.provider.send("evm_mine", []);

		await RetweetProtocol_Contract.connect(randomPerson).reclaimContribution(1);
		let bounty = await RetweetProtocol_Contract.bounties(1);
		expect(bounty.totalAmount).to.equal(0);
	});


	it("Should allow Oracle to start lockup and release bounty", async function() {

		// Add bounty of 100 ETH + lockuperiod 1 day by randomPerson
		await RetweetProtocol_Contract.connect(randomPerson)
			.addBounty(
				1, // NID or unique ID
				constants.ZERO_ADDRESS, // ETH as the token
				ethers.utils.parseEther("100"), // 100 ETH
				86400, // 1 day lockup duration
				{
					value: ethers.utils.parseEther("100")
				} // ETH value sent to TX
			);

		// Start the lockup via Oracle
		await RetweetProtocol_Contract.connect(oracle).startLockup(1);
		let bounty = await RetweetProtocol_Contract.bounties(1);
		expect(bounty.lockupEnd).to.be.gt(0); // Lockup should have started

		// Simulate passing of time (1 day)
		await ethers.provider.send("evm_increaseTime", [86400]);
		await ethers.provider.send("evm_mine", []);

		// Release the bounty via Oracle
		await RetweetProtocol_Contract.connect(oracle).releaseBounty(1, randomPerson_2.address);

		// Verify bounty is marked as released
		bounty = await RetweetProtocol_Contract.bounties(1);
		expect(bounty.isReleased).to.be.true;
		expect(bounty.recipient).to.equal(randomPerson_2.address);
	});

	it("Should apply fee when claiming bounty (non-RetweetToken)", async function() {
		// Set fee to 5%
		await RetweetProtocol_Contract.connect(manager).setFeePercentage(5);

		// Set a valid treasury address
		await RetweetProtocol_Contract.connect(manager).setTreasuryAddress(treasury.address);

		// Mint 1000 USDC for randomPerson
		await USDC_Contract.connect(randomPerson).mintTokens(1000 * 10 ** USDC_Decimals);

		// Approve and add a bounty of 100 USDC
		await USDC_Contract.connect(randomPerson).approve(RetweetProtocol_Contract.address, 100 * 10 ** USDC_Decimals);
		await RetweetProtocol_Contract.connect(randomPerson).addBounty(
			1,
			USDC_Contract.address,
			100 * 10 ** USDC_Decimals,
			86400
		);

		// Start the lockup
		await RetweetProtocol_Contract.connect(oracle).startLockup(1);

		// Simulate passing of time (1 day)
		await ethers.provider.send("evm_increaseTime", [86400]);
		await ethers.provider.send("evm_mine", []);

		// Release the bounty
		await RetweetProtocol_Contract.connect(oracle).releaseBounty(1, randomPerson_2.address);

		// Claim the bounty
		await RetweetProtocol_Contract.connect(randomPerson_2).getBounty(1);

		// Check final USDC balance of randomPerson_2 after fees
		let finalBalance = await USDC_Contract.balanceOf(randomPerson_2.address);
		let expectedAmount = 95 * 10 ** USDC_Decimals; // 100 USDC minus 5% fee
		expect(finalBalance).to.equal(expectedAmount);
	});

	it("Should allow manager to set treasury address", async function() {
		await RetweetProtocol_Contract.connect(manager).setTreasuryAddress(treasury.address);
		let treasuryAddress = await RetweetProtocol_Contract.treasury();
		expect(treasuryAddress).to.equal(treasury.address);
	});
	it("Should not allow setting invalid treasury address", async function() {
		await expect(
			RetweetProtocol_Contract.connect(manager).setTreasuryAddress(constants.ZERO_ADDRESS)
		).to.be.revertedWith("Invalid treasury address");
	});
	it("Should allow manager to set fee percentage", async function() {
		await RetweetProtocol_Contract.connect(manager).setFeePercentage(5);
		let fee = await RetweetProtocol_Contract.feePercentage();
		expect(fee).to.equal(5);
	});

});