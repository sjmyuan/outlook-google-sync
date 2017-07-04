import AWS from 'aws-sdk';

const getQueueUrl = queueName => new Promise((resolve, reject) => {
  const sqs = new AWS.SQS();
  sqs.getQueueUrl({ QueueName: queueName }, (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data);
    }
  });
});

const fetchMessage = queueUrl => new Promise((resolve, reject) => {
  const sqs = new AWS.SQS();
  sqs.receiveMessage({ QueueUrl: queueUrl }, (err, data) => {
    if (err) reject(err);
    else resolve(data);
  });
});

const sendMessage = (queueUrl, message) => {
  new Promise((resolve, reject) => {
    const sqs = new AWS.SQS();
    sqs.sendMessage({ QueueUrl: queueUrl, MessageBody: message }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
};

const sendTopic = (topicName, message) => {
  new Promise((resolve, reject) => {
    const sns = new AWS.SNS();
    sns.publish({ TopicArn: topicName, Message: message }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
};
