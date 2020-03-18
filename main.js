const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.INFO);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://thl.fi/en/web/infectious-diseases/what-s-new/coronavirus-covid-19-latest-updates';
    const kvStore = await Apify.openKeyValueStore("COVID-19-FINLAND");
    const dataset = await Apify.openDataset("COVID-19-FINLAND-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 1,
        handlePageTimeoutSecs: 60,

        handlePageFunction: async ({ request, $ }) => {
            log.info(`Processing ${request.url}...`);

            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-fi",
            };

            const confirmedDateText = $('#column-2-2 .journal-content-article > p:first-child').text();
            const matchUpadatedAt = confirmedDateText.match(/(\d+)\s+([a-zA-Z]+) at (\d+):(\d+)/);

            if (matchUpadatedAt && matchUpadatedAt.length > 4) {
                const currentYear = moment().tz('Europe/Helsinki').year();
                const dateTimeStr = `${currentYear}.${matchUpadatedAt[2]}.${matchUpadatedAt[1]} ${matchUpadatedAt[3]}:${matchUpadatedAt[4]}`;
                const dateTime = moment.tz(dateTimeStr, "YYYY.MMMM.DD H:mm", 'Europe/Helsinki');
               
                data.lastUpdatedAtSource = dateTime.toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            const h2List = $('#column-2-2 .journal-content-article > h2');
            for (let index=0; index < h2List.length; index++) {
                const el = $(h2List[index]);
                if (el.text().includes('Finland')) {
                    const confirmedCasesText = el.next().find('li:first-child').text();
                    log.info(confirmedCasesText);
                    const parts = confirmedCasesText.match(/\s+(\d+)\s+/);
                    if (parts) {
                        data.confirmedCases = parseInt(parts[1]);
                        break;
                    }
                }
            }

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    log.info('Crawler finished.');
});
