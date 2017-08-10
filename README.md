# outlook-google-sync
![build](https://travis-ci.org/sjmyuan/outlook-google-sync.svg)
[![Coverage Status](https://coveralls.io/repos/github/sjmyuan/outlook-google-sync/badge.svg?branch=master)](https://coveralls.io/github/sjmyuan/outlook-google-sync?branch=master)

## Infrastructure
![Infrastructure](./images/outlook-google-sync.png?raw=true)

## Purpose
This repo is used to synchronize events from Outlook to Gmail. it use OAuth2.0 to access the email api.

## Features
+ Support OAuth2.0
+ Support filtering duplicated events
+ Support booking rooms for Gmail
+ Support ignoring events by subject
+ Support ordering rooms 
+ Support email group

## How to use
1. Register user using /add/user
2. Add involved attendees using /add/attendees
3. Authenticate Outlook using /outlook/login?id=<user id>
4. Authenticate Gmail using /google/login?id=<user id>

## To do list
+ Add configuration ui
+ Send authentication email
+ Support booking room for no location events
+ Only synchronize events with valid room
