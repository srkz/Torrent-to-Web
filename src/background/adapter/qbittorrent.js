'use strict';

torrentToWeb.adapter.qbittorrent = function (baseUrl, username, password, autostart, cfAccessClientID, cfAccessClientSecret) {
    let baseUrlObject = new URL(baseUrl);
    baseUrlObject.pathname = '/api/v2';

    baseUrl = baseUrlObject.toString();
    let refUrl = baseUrl.replace(/(:\d+).*$/, '$1');
    let filterUrls = refUrl.replace(/:\d+.*$/, '/*');
    let sessionCookie = null;

    function login () {
        let requestData = new URLSearchParams();
        requestData.append('username', username);
        requestData.append('password', password);
		let requestHeaders = new Headers();
		requestHeaders.set('CF-Access-Client-Id', cfAccessClientID);
		requestHeaders.set('CF-Access-Client-Secret', cfAccessClientSecret);

        return new Promise((resolve, reject) => {
            fetch(baseUrl + '/auth/login', {
                method: 'POST',
                credentials: 'omit',
				headers: requestHeaders,
                body: requestData,
            }).then((response) => {
                if (response.ok) {
                    return response.text();
                }

                throw new Error(response.status.toString() + ': ' + response.statusText);
            }).then((txt) => {
                if (txt === 'Ok.') {
                    resolve();
                    return;
                }

                throw new Error('Login error: ' + txt);
            }).catch((error) => reject(error));
        });
    }

    function logout () {
		let requestHeaders = new Headers();
		requestHeaders.set('CF-Access-Client-Id', cfAccessClientID);
		requestHeaders.set('CF-Access-Client-Secret', cfAccessClientSecret);
		
        return new Promise((resolve, reject) => {
            fetch(baseUrl + '/auth/logout', {
                method: 'POST',
				headers: requestHeaders,
            }).finally(() => {
                sessionCookie = null;
                removeFilter();
                resolve();
            }).catch((error) => reject(error));
        });
    }

    return {
        send: function (filenameOrUrl, data, callback) {
            let requestData = new FormData();

            if (! autostart) {
                requestData.append('paused', 'true');
            }

            if (filenameOrUrl.startsWith('magnet:')) {
                requestData.append('urls', filenameOrUrl + '\n');
            } else {
                requestData.append('torrents', data, filenameOrUrl);
            }

            installFilter();
            login().then(() => {
                sendAddRequest(requestData).then(() => {
                    logout();
                    callback(true);
                }, (error) => {
                    removeFilter();
                    callback(error);
                });
            }, (error) => {
                removeFilter();
                callback(error);
            });
        }
    };

    function sendAddRequest (requestData) {	
        return new Promise((resolve, reject) => {
            fetch(baseUrl + '/torrents/add', {
                method: 'POST',
				headers: requestHeaders,
                body: requestData,
            }).then((response) => {
                if (response.ok) {
                    resolve();
                    return;
                }

                throw new Error('Could not add torrent');
            }).catch((error) => reject(error));
        });
    }

    function removeHeaders (headers, unwanted) {
        return headers.filter((header) => {
            return ! unwanted.includes(header.name.toLowerCase());
        });
    }

    function receiveFilter (details) {
        let headers = details.responseHeaders;
        let cookie = headers.find((header) => {
            return header.name.toLowerCase() === 'set-cookie';
        });

        if (cookie) {
            sessionCookie = cookie.value.replace(/;.*$/, '');
        }

        return {
            responseHeaders: removeHeaders(headers, ['set-cookie'])
        };
    }

    function sendFilter (details) {
        let headers = removeHeaders(details.requestHeaders, [
            'cookie', 'origin', 'referer',
        ]);
        headers.push({name: 'Referer', value: refUrl});
        headers.push({name: 'Origin', value: refUrl});

        if (sessionCookie) {
            headers.push({name: 'Cookie', value: sessionCookie});
        }

        return {
            requestHeaders: headers
        };
    }

    function installFilter () {
        browser.webRequest.onBeforeSendHeaders.addListener(
            sendFilter,
            {urls: [filterUrls]},
            ['blocking', 'requestHeaders']
        );
        browser.webRequest.onHeadersReceived.addListener(
            receiveFilter,
            {urls: [filterUrls]},
            ['blocking', 'responseHeaders']
        );
    }

    function removeFilter () {
        browser.webRequest.onHeadersReceived.removeListener(receiveFilter);
        browser.webRequest.onBeforeSendHeaders.removeListener(sendFilter);
    }
};
