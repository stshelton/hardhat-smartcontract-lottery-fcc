const { ethers, network } = require("hardhat")
const fs = require("fs")

const FRONT_END_ADDRESSES_FILE = "../nextjs-smartcontract-lottery/constants/contractAddresses.json"
const FRONT_END_API_FILE = "../nextjs-smartcontract-lottery/constants/abi.json"

//creating a script to update frontends constants
module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("updating front end")
        updateContractAddresses()
        updateABI()
    }
}

async function updateContractAddresses() {
    const raffle = await ethers.getContract("Raffle")
    const currentAddress = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE), "utf8")
    const chainId = network.config.chainId.toString()
    if (network.config.chainId.toString in currentAddress) {
        if (!currentAddress[chainId].includes(raffle.address)) {
            currentAddress[chainId].push(raffle.address)
        }
    } else {
        currentAddress[chainId] = [raffle.address]
    }

    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddress))
}

async function updateABI() {
    const raffle = await ethers.getContract("Raffle")
    //get abi get raffle using interface
    fs.writeFileSync(FRONT_END_API_FILE, raffle.interface.format(ethers.utils.FormatTypes.json))
}

module.exports.tags = ["all", "frontEnd"]
