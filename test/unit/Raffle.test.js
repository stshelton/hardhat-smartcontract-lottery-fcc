const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("raffle unit test", function () {
          //what do we need in this test
          //1) raffle contract
          //2) vrfCoordinatorV2Mock
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId
          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer

              await deployments.fixture(["all"])
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)

              interval = await raffle.getInterval()
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  //0 == Ooen
                  assert.equal(raffleState.toString(), 0)
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "NotEnoughFunds"
                  )
              })

              it("records players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //make sure deployer is actually in contract
                  const playerFromContract = await raffle.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })

              it("emits event on enter", async function () {
                  //checking to see if function emits an event
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })

              it("doesnt allow entrance when raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  //we need to check up keep, and check up keep needs to be true
                  /**
                   * Whats need for check upkeep to be true
                   * bool isOpen = (RaffleState.OPEN == s_raffleState);
                   * bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
                   * bool hasPlayers = (s_players.length > 0);
                   * bool hasBalance = address(this).balance > 0;
                   * upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
                   */
                  //is open (yes we know its open)
                  //time passed: hardhat contains hardhat network methods (allows u to manipulate block chain howd u like)
                  //time passed: so using hardhat network method `evm_increaseTime` https://hardhat.org/hardhat-network/docs/reference#special-testing-debugging-methods
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  //pretending to be chainlink keeper
                  await raffle.performUpkeep([])
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWithCustomError(raffle, "RaffleNotOpen")
              })
          })

          describe("checkUpKeep", function () {
              it("returns false if people havnt sent any eth", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  //using callstatic will give you the return of upkeep needed
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isnt open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })

                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  //pretending to be chainlink keeper and using to make state calculating for this test
                  await raffle.performUpkeep([])

                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })

          describe("performUpKeep", function () {
              it("can only run if check up keep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await makeTimeMoveForwardOnLocalBlockChain(interval)

                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("reverts when checkupkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle_UpkeepNotNeeded"
                  )
              })

              it("updates raffle statem emits and event and calls the vrf coordintator", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await makeTimeMoveForwardOnLocalBlockChain(interval)
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestID = txReceipt.events[1].args.requestId

                  const raffleState = await raffle.getRaffleState()
                  await assert.equal(raffleState.toString(), "1")
                  await assert(requestID.toNumber() > 0)
              })
          })

          describe("fullfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await makeTimeMoveForwardOnLocalBlockChain(interval)
              })

              it("can only be called after performUpkeep", async function () {
                  //args for fullfillRandomWorkds (request id, consumer address )
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner , resets the lottery, and sends money", async function () {
                  //amount of people entering lottery (4total including deployer)
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // depoyer = 0
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp()

                  //performUpkeep (mock being chainlink keepers)
                  // fullfillrandomWords (mock being the chainlink VRF)
                  // we will have to wait for the fullFillRandomWords to be called (on test/live chain)
                  await new Promise(async function (resolve, reject) {
                      //listening for winner picked event to be called
                      raffle.once("WinnerPicked", async () => {
                          console.log("found the event!")
                          try {
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)
                              const recentWinner = await raffle.getRecentWinner()
                              console.log(recentWinner)
                              const raffleState = await raffle.getRaffleState()
                              const playerCount = await raffle.getNumberOfPlayers()
                              const lastTimesStamp = await raffle.getLatestTimeStamp()
                              const winnerEndingBalance = await accounts[1].getBalance()

                              assert.equal(playerCount.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(lastTimesStamp > startingTimeStamp)

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEntrants)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }

                          resolve()
                      })
                      //setting up the listener
                      //below, we will fire the event, and the listnere will pick it up, and resolve
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      console.log(txReceipt.events[1].args.requestId)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })

const makeTimeMoveForwardOnLocalBlockChain = async function (interval) {
    await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
    await network.provider.send("evm_mine", [])
}
