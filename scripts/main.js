'use strict';
// libraries
const fs = require('fs');
const path = require('path');
const httpsRateLimit = require('https-rate-limit');

// modules

// constants
// const ZEROS = '0000000000000000000000000000000000000000000000000000000000000000';
const FIRST_ACCOUNT = 'ban_1111111111111111111111111111111111111111111111111111hifc8npp';

const config = require('./config.json');
const configOverride = require('../config.json');

const run = async () => {
  console.log('banano-timestamp-checker');

  overrideConfig();

  if (!fs.existsSync(config.accounts.dir)) {
    fs.mkdirSync(config.accounts.dir, {recursive: true});
  }
  if (!fs.existsSync(config.frontiers.dir)) {
    fs.mkdirSync(config.frontiers.dir, {recursive: true});
  }

  const fromFrontierFileNm = path.join(config.frontiers.dir, `fromFrontiers.json`);
  if (fs.existsSync(fromFrontierFileNm)) {
    console.log(`skipping fromFrontiers`);
  } else {
    console.log(`starting fromFrontiers`);
    const fromFrontierByAccountMap = await getFrontierByAccountMap(config.from);
    // const toFrontierByAccountMap = await getFrontierByAccountMap(config.to);
    const fromFrontierData = {};
    for (const [account, fromFrontier] of fromFrontierByAccountMap.entries()) {
      fromFrontierData[account] = fromFrontier;
    }
    const fromFrontierFilePtr = fs.openSync(fromFrontierFileNm, 'w');
    fs.writeSync(fromFrontierFilePtr, JSON.stringify(fromFrontierData, null, 2));
    fs.closeSync(fromFrontierFilePtr);
    console.log(`finished fromFrontiers`);
  }
  const fromFrontierByAccountMap = new Map();
  if (config.frontiers.refresh) {
    console.log(`starting fromFrontierByAccountMap`);
    const fromFrontierDataStr = fs.readFileSync(fromFrontierFileNm, 'UTF-8');
    console.log(`starting fromFrontierByAccountMap`, 'read');
    const fromFrontierData = JSON.parse(fromFrontierDataStr);
    console.log(`starting fromFrontierByAccountMap`, 'parsed');
    const fromFrontierKeys = Object.keys(fromFrontierData);
    console.log(`starting fromFrontierByAccountMap`, 'keys');
    const max = fromFrontierKeys.length;
    const logDiff = Math.max(1, Math.round(max / 1000));
    let total = 0;
    let logged = 0;  
    console.log(`starting fromFrontierByAccountMap`, 'max', max);
    for (const fromFrontierKey of fromFrontierKeys) {
      const frontier = fromFrontierKeys[fromFrontierKeys];
      fromFrontierByAccountMap.set(fromFrontierKey, frontier);
      total++;
      if (total > logged + logDiff) {
        const pctStr = ((total*100)/max).toFixed(2);
        console.log(`gap block ${total} of ${max} ${pctStr}%`);
        logged = total;
      }
    }
    console.log(`finished fromFrontierByAccountMap`);
  } else {
    console.log(`skipping fromFrontierByAccountMap`);
  }

  if (config.accounts.refresh) {
    console.log(`starting refreshAccountData`);
    await refreshAccountData(fromFrontierByAccountMap);
    console.log(`finished refreshAccountData`);
  } else {
    console.log(`skipping refreshAccountData`);
  }

  // for each account, check if the "from" node has the "to" block.
  // if the "to" block is missing, then thats the gap block.
  const accountDataFileNames = fs.readdirSync(config.accounts.dir);
  const max = accountDataFileNames.length;
  const logDiff = Math.max(1, Math.round(max / 1000));
  let total = 0;
  let logged = 0;
  let gap = 0;
  const toFrontiers = [];
  for (const accountDataFileName of accountDataFileNames) {
    const fileNm = path.join(config.accounts.dir, accountDataFileName);
    const dataStr = fs.readFileSync(fileNm, 'UTF-8');
    const accountData = JSON.parse(dataStr);
    // const account = accountData.account;
    // const fromFrontier = accountData.fromFrontier;
    const toFrontier = accountData.toFrontier;
    toFrontiers.push(toFrontier);
  }
  const toBlockInFromNodes = await getBlocksInfo(config.from, toFrontiers);
  console.log('toBlockInFromNodes', `length`, Object.keys(toBlockInFromNodes.blocks).length);
  const fromSuccessors = [];
  for (const accountDataFileName of accountDataFileNames) {
    const fileNm = path.join(config.accounts.dir, accountDataFileName);
    const dataStr = fs.readFileSync(fileNm, 'UTF-8');
    const accountData = JSON.parse(dataStr);
    const account = accountData.account;
    // const fromFrontier = accountData.fromFrontier;
    const toFrontier = accountData.toFrontier;
    const toBlockInFromNode = toBlockInFromNodes.blocks[toFrontier];
    if (toBlockInFromNode == undefined) {
      console.log('gap block', `account`, account, `toBlockInFromNode`, toBlockInFromNode !== undefined);
      gap++;
    } else {
      fromSuccessors.push(toBlockInFromNode.successor);
    }
    total++;
    if (total > logged + logDiff) {
      const pctStr = ((total*100)/max).toFixed(2);
      console.log(`gap block ${total} of ${max} ${pctStr}%`);
      logged = total;
    }
  }

  console.log('fromSuccessors', `length`, fromSuccessors.length);
  const successorBlocksInToNodes = await getBlocksInfo(config.to, fromSuccessors);
  if (successorBlocksInToNodes.error == 'Block not found') {
    successorBlocksInToNodes.blocks = {};
  }
  console.log('successorBlocksInToNodes', `length`, Object.keys(successorBlocksInToNodes.blocks).length);

  total = 0;
  logged = 0;
  let logMsg = '';
  for (const accountDataFileName of accountDataFileNames) {
    const fileNm = path.join(config.accounts.dir, accountDataFileName);
    const dataStr = fs.readFileSync(fileNm, 'UTF-8');
    const accountData = JSON.parse(dataStr);
    const account = accountData.account;
    // const fromFrontier = accountData.fromFrontier;
    const toFrontier = accountData.toFrontier;
    const successorBlocksInToNode = successorBlocksInToNodes.blocks[toFrontier];
    // console.log('successorBlocksInToNode', `account`, account, `successorBlocksInToNode`, successorBlocksInToNode);
    if (successorBlocksInToNode == undefined) {
      const toBlockInFromNode = toBlockInFromNodes.blocks[toFrontier];
      if (toBlockInFromNode !== undefined) {
        const processResp = await processBlock(config.to, toBlockInFromNode);
        if (processResp.error == 'Old block') {
        } else if (processResp.error == 'Invalid block balance for given subtype') {
        } else {
          console.log(logMsg, 'successorBlocksInToNode', `account`, account, `processResp`, processResp);
        }
      }
    }
    total++;
    if (total > logged + logDiff) {
      const pctStr = ((total*100)/max).toFixed(2);
      logMsg = `successo block ${total} of ${max} ${pctStr}%`;
      console.log(logMsg);
      logged = total;
    }
  }

  console.log(`total gap count ${gap}`);
  // console.log(`total to count ${toFrontierByAccountMap.size}`);
};

const refreshAccountData = async (fromFrontierByAccountMap) => {
  let totalMisMatch = 0;
  let totalMissing = 0;
  let total = 0;
  let logged = 0;

  const max = await getFrontierCount(config.to);
  const logDiff = Math.max(1, Math.round(max / 1000));
  for (const [account, fromFrontier] of fromFrontierByAccountMap.entries()) {
    // console.log('account', account, 'fromFrontier', fromFrontier);
    const toFrontier = await getFrontierByAccount(config.to, account);
    // const toFrontier = toFrontierByAccountMap[account];
    if (toFrontier !== undefined) {
      if (fromFrontier != toFrontier) {
        totalMisMatch++;

        const accountOutFileNm = path.join(config.accounts.dir, `${account}.json`);
        const accountOutData = {
          account: account,
          fromFrontier: fromFrontier,
          toFrontier: toFrontier,
        };

        const accountOutFilePtr = fs.openSync(accountOutFileNm, 'w');
        fs.writeSync(accountOutFilePtr, JSON.stringify(accountOutData, null, 2));
        fs.closeSync(accountOutFilePtr);
        // console.log('account', account, 'fromFrontier', fromFrontier, 'toFrontier', toFrontier);
      }
    } else {
      totalMissing++;
    }
    total++;
    if (total > logged + logDiff) {
      const pctStr = ((total*100)/max).toFixed(2);
      console.log(`to frontier count ${total} of ${max} ${pctStr}%`);
      logged = total;
    }
  }
  console.log(`total missing count ${totalMissing} of + ${fromFrontierByAccountMap.size}`);
  console.log(`total mismatch count ${totalMisMatch} of + ${fromFrontierByAccountMap.size}`);
};

const processBlock = async (url, blockData) => {
  httpsRateLimit.setUrl(url);
  // console.log('processBlock', `blockData`, blockData);
  const req = {
    action: 'process',
    json_block: 'true',
    subtype: blockData.subtype,
    block: blockData.contents,
  };
  const resp = await httpsRateLimit.sendRequest(req);
  return resp;
};

const getBlocksInfo = async (url, hashes) => {
  httpsRateLimit.setUrl(url);
  const req = {
    action: 'blocks_info',
    json_block: 'true',
    hashes: hashes,
  };
  const resp = await httpsRateLimit.sendRequest(req);
  return resp;
};

const getFrontierByAccount = async (url, account) => {
  // console.log('getFrontierByAccount', account);
  const frontiersResp = await getFrontierByAccountResponse(url, account, 1);
  // console.log('getFrontierByAccount', account, frontiersResp);
  const frontier = frontiersResp.frontiers[account];
  return frontier;
};

const getFrontierByAccountResponse = async (url, account, count) => {
  httpsRateLimit.setUrl(url);
  const frontiersReq = {
    action: 'frontiers',
    account: account,
    count: count,
  };
  const frontiersResp = await httpsRateLimit.sendRequest(frontiersReq);
  return frontiersResp;
};

const getFrontierByAccountMap = async (url) => {
  const max = await getFrontierCount(url);
  const frontierByAccountMap = new Map();

  let frontiersAccount = FIRST_ACCOUNT;
  while (frontiersAccount != undefined) {
    const pctStr = ((frontierByAccountMap.size*100)/max).toFixed(3);
    console.log(`frontier count ${frontierByAccountMap.size} of ${max} ${pctStr}%`);
    const frontiersResp = await getFrontierByAccountResponse(url, frontiersAccount, config.frontiers.count);

    // prevent infinite loop.
    frontiersAccount = undefined;

    const accounts = Object.keys(frontiersResp.frontiers);
    for (const account of accounts) {
      const frontier = frontiersResp.frontiers[account];
      frontierByAccountMap.set(account, frontier);
      // console.log('account', account, 'frontier', frontier);
      frontiersAccount = account;
    }

    // for debugging, allow max size.
    if (frontierByAccountMap.size >= max) {
      frontiersAccount = undefined;
    }
  }
  console.log(`total frontier count ${frontierByAccountMap.size} of ${max}`);
  return frontierByAccountMap;
};

const getFrontierCount = async (url) => {
  httpsRateLimit.setUrl(url);
  const req = {
    action: 'frontier_count',
  };
  const resp = await httpsRateLimit.sendRequest(req);
  // for debugging, allow max size.
  // resp.count = 2000;
  return resp.count;
};

const isObject = function(obj) {
  return (!!obj) && (obj.constructor === Object);
};

const overrideValues = (src, dest) => {
  Object.keys(src).forEach((key) => {
    const srcValue = src[key];
    const destValue = dest[key];
    if (isObject(destValue)) {
      overrideValues(srcValue, destValue);
    } else {
      dest[key] = srcValue;
    }
  });
};

const overrideConfig = () => {
  console.debug('STARTED overrideConfig', config);
  overrideValues(configOverride, config);
  console.debug('SUCCESS overrideConfig', config);
};

run()
    .catch((e) => {
      console.info('FAILURE init.', e.message);
      console.trace('FAILURE init.', e);
    });
