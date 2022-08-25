const { network, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utlis/verify")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("30")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordintatorV2Address, subscriptionId
    //if dev chain deploy mock
    if (developmentChains.includes(network.name)) {
        const vrfCoordintatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordintatorV2Address = vrfCoordintatorV2Mock.address

        //create subscription for local
        const transactionResponse = await vrfCoordintatorV2Mock.createSubscription()
        //create subscription emits an event to get subscription id
        const transactionReceipt = await transactionResponse.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId
        //now we need to fund subscription
        //usually u need link token on a real network but mock allows u to do it without link token
        await vrfCoordintatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        subscriptionId = networkConfig[chainId]["subscriptionId"]
        //CONTRACT ADDRESS IN HELPER FILE
        vrfCoordintatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
    }
    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    // uint256 entranceFee,
    // address vrfCoordinatorV2, //contract address (will need to deploy mock)
    // bytes32 maxGasWillingToPayForRandomNumber,
    // uint64 subscriptionID,
    // uint32 callbackGasLimit,
    // uint256 interval
    const args = [
        entranceFee,
        vrfCoordintatorV2Address,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval,
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        logs: true,
        waitConfirmations: network.config.blockConfirmation || 1,
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying....")
        await verify(raffle.address, args)
    }

    log("-------------------raffle deploy----------------------")
}

module.exports.tags = ["all", "raffle"]
