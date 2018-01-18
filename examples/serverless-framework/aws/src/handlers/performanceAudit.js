const runLighthouse = require('./runLighthouse');
const AWS = require('aws-sdk');
const fetch = require('isomorphic-fetch');
const uuid = require('uuid/v4');
const zlib = require('zlib');

export default async function runAudit(event, context, callback) {
  try {
    const { queryStringParameters: { url, pageType, name } } = event;

    // get lighthouse audit
    const audit = runLighthouse(url, 'node_modules/lighthouse/lighthouse-core/config/perf.json');

    // upload to elastic search
    addESIndex(name, pageType, audit);
  } catch (e) {
    next(e);
  }

  callback(null, {
    statusCode: 200,
    body: JSON.stringify({
      audit,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function addESIndex(name, pageType, audit) {
  const baseURL =
    'http://elastic.intranet.1stdibs.com:9200/lighthouse-' +
    String(new Date().getFullYear()) +
    '/external/';
  const elasticsearchURL = baseURL + '-' + name + '-' + audit.generatedTime;
  const payload = {
    uuid: uuid(),
    file: transformAuditForES(audit),
    time: Date.now(),
    generatedTime: audit.generatedTime,
    branch: process.env.GIT_BRANCH,
    buildUrl: process.env.BUILD_URL,
    page: name,
  };
  console.log('beginning elasticsearch upload', elasticsearchURL);
  console.log(payload);

  return fetch(elasticsearchURL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
    .then(response => {
      if (!response.ok) {
        console.log('Upload to Elasticsearch Failed: ' + elasticsearchURL);
        console.log('Upload Error: ', response.statusText);
      } else {
        console.log('Upload to ElasticSearch Success: ' + elasticsearchURL);
      }
      return response.json();
    })
    .then(json => {
      console.log('Response:');
      console.log(json);
    });
}

function transformAuditForES(audit) {
  /* 
        HACK: elastic search doesn't like when the same field can have different type values
        (ie fields that are numbers should always be numbers, not object or string)
        but the lighthouse report will type things differently, so have to go through and make everything uniform
        tis bad

        TODO: set up lighthouse to take custom audit report where everything is uniformly typed
    */

  Object.keys(audit.audits).forEach(metricKey => {
    audit.audits[metricKey].rawValue = +audit.audits[metricKey].rawValue;
  });

  audit.reportCategories[0].audits.map(report => {
    report.result.score = +report.result.score;
    report.result.rawValue = +report.result.rawValue;
    report.score = +report.score;

    // this one can be an object or a string, dunno why, just always set to string
    if (report.result.details && report.result.details.header) {
      report.result.details.header = 'View Details';
    }
  });

  return audit;
}
