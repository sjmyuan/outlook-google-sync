import _ from 'lodash';
import oauth2 from './credential';

const getAuthUrl = (redirect_uri, scope) => {
  const returnVal = oauth2.authorizationCode.authorizeURL({
    redirect_uri,
    scope,
  });
  console.log(`Generated auth url: ${returnVal}`);
  return returnVal;
};

const getTokenFromCode = (auth_code, redirect_uri, scope, callback) => new Promise((resolve, reject) => {
  oauth2.authorizationCode.getToken({
    code: auth_code,
    redirect_uri,
    scope,
  }, (error, result) => {
    if (error) {
      reject(`getTokenFromCod error ${error}`);
    } else {
      const token = oauth2.accessToken.create(result);
      resolve(token);
    }
  });
});

const refreshAccessToken = refreshToken => new Promise((resolve, reject) => {
  const tokenObj = oauth2.accessToken.create({ refresh_token: refreshToken });
  tokenObj.refresh((err, token) => {
    if (err) {
      reject(`refreshAccessToken error ${err}`);
    } else if (_.isNull(token)) {
      reject('Token is null');
    } else {
      resolve(token);
    }
  });
});

export { getAuthUrl, getTokenFromCode, refreshAccessToken };
