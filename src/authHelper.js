import _ from 'lodash';

const getAuthUrl = (oauth2, redirect_uri, scope) => {
  const returnVal = oauth2.authorizationCode.authorizeURL({
    redirect_uri,
    scope,
    access_type: 'offline',
    prompt: 'consent',
  });
  console.log(`Generated auth url: ${returnVal}`);
  return returnVal;
};

const getTokenFromCode = (oauth2, auth_code, redirect_uri, scope) => new Promise((resolve, reject) => {
  oauth2.authorizationCode.getToken({
    code: auth_code,
    redirect_uri,
    scope,
  }, (error, result) => {
    if (error) {
      reject(`getTokenFromCod error ${error}`);
    } else {
      const token = oauth2.accessToken.create(result);
      console.log(token);
      resolve(token);
    }
  });
});

const refreshAccessToken = (oauth2, refreshToken) => new Promise((resolve, reject) => {
  const tokenObj = oauth2.accessToken.create({ refresh_token: refreshToken });
  tokenObj.refresh((err, token) => {
    if (err) {
      reject(`refreshAccessToken error ${err}`);
    } else if (_.isNull(token)) {
      reject('Token is null');
    } else {
      const newToken = _.cloneDeep(token);
      if (_.isUndefined(newToken.token.refresh_token)) {
        console.log('refresh token is undefined');
        newToken.token.refresh_token = refreshToken;
      }
      resolve(newToken);
    }
  });
});

export { getAuthUrl, getTokenFromCode, refreshAccessToken };
