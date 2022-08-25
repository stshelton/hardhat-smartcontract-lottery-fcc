const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

/**
 * How to Deploy on test network
 * 1) Get our SubId for chainlink VRD
 * 2) Deploy our contract using the subId
 * 3) Register the contract with Chainlike VRF & it's subId
 * 4) Register the contract with chainlink keepers
 * 5) Run staging tests
 */

//if we on local network skip
developmentChains.includes(network.name)
    ? describe.skip
    : describe("raffle staging test", function () {
          //what do we need in this test
          //1) raffle contract
          //2) vrfCoordinatorV2Mock
          let raffle, raffleEntranceFee, deployer, interval

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fullfillRandomWords", function () {
              it("works with live chainlink keepers and chainlink VRF, we get a random winnder", async function () {
                  console.log("Setting up test...")
                  //enter the raffle
                  const startingTimeStamp = await raffle.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()
                  //setup listener before we enter raffle
                  //just incase blockchain is really fast
                  console.log("Setting up listener...")
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              //add our asserts here
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnderBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()

                              //checks if player array is zero. this should revert cz player array should be reset
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnderBalance.toString(),
                                  winnderStartingBalance.add(raffleEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (Error) {
                              console.log(Error)
                              reject(e)
                          }
                      })
                      console.log("entering raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("ok time to wait")
                      const winnderStartingBalance = await accounts[0].getBalance()

                      //and this code wont complete until our listner has finished listening or times out
                  })
              })
          })
      })
