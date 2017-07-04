import { getAuthUrl, getTokenFromCode } from './authHelper';
import _ from 'lodash';

module.exports.login = (event, context, cb) => {
  const authUrl = getAuthUrl(`https://${event.headers.Host}/dev/authorize`, 'openid Mail.Read');
  cb(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: `<p>Please <a href="${authUrl}">sign in</a> with your Office 365 or Outlook.com account.</p>` });
  return true;
};

module.exports.authorize = (event, context, cb) => {
  const code = _.get(event, 'queryStringParameters.code');
  const host = _.get(event, 'headers.Host')
  const stage = _.get(context, 'stage')
  const redirectPath = _.get(event, 'stageVariables.redirect_path');
  const scope = _.get(event, 'stageVariables.scope');
  const redirectUrl = `https://${host}/${stage}/${redirectPath}`
  console.log(`The code is ${code}`);
  console.log(`The redirect url is ${redirectUrl}`);
  console.log(`The scope url is ${scope}`);
  getTokenFromCode(code,redirectUrl,scope).then((token)=>{
    return sendMessage(queueName,code)
  }).then(()=>{
    cb(null, { statusCode: 200, headers: {}, body: 'Success to login'});
  }
  ).catch((err)=>{
    console.log(`Failed to authorize,error message is ${err}`)
    cb(null, { statusCode: 500, headers: {}, body: 'Failed to authorize'});
  })
  return true;
};

module.exports.refresh_token = (event) => {
  fetchMessage(queueName).then((message)=>{
    if(_.empty(message)){
      Promise.reject('Token is empty')
    }else{
      return sendMessage(queueName,token).then(()=>{
        return sendTopic(topicName,token)
      })
    }
  }).catch(error=>{
    console.log('Failed to refresh token, error message is '+error)
  })
};

module.exports.synchronize_event = (event) => {
  fetchOutlookEvents(event.token, 7 days).then((events)=>{
    Promise.all(
      _.map(events,(event)=> createGmailEvent(composeGmailEvent(event)))
    )
  }).then(error=>{
    console.log('Failed to synchronize event')
  })
};
