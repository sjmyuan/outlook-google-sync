import _ from 'lodash';

const sequence = (promiseSeq, ignoreError = true) => _.reduce(promiseSeq, (sum, x) => {
  if (ignoreError) { return sum.catch(() => 'ignore').then(() => x); }
  return sum.then(() => x);
}, Promise.resolve('start'));

const lazySequence = (promiseFuncs, ignoreError = true) => _.reduce(promiseFuncs, (sum, func) => {
  if (ignoreError) { return sum.catch(() => 'ignore').then(() => func()); }
  return sum.then(() => func());
}, Promise.resolve('start'));

export {
  sequence,
  lazySequence,
};
