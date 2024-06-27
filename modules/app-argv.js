import * as YargsInit from 'yargs';

class Args {
    constructor(config){
        this.accounts = Object.keys(config.accounts);
        this.remote_dir = config.remote_dir;
        this.yargs = YargsInit.default
            (process.argv).wrap(Math.min(120))
            .usage('Usage: $0 [options]')
            .help(false).version(false)
            .options({
            a: {
                alias: ['acc'],
                describe: 'Use Account ID',
                choices: Object.keys(config.accounts),
                type: 'string',
            },
            l: {
                alias: ['local'],
                describe: 'Select Local Dir',
                type: 'string',
            },
            r: {
                alias: ['remote'],
                describe: 'Select Remote Dir',
                type: 'string',
            },
        })
        .parserConfiguration({
            'duplicate-arguments-array': false,
            'camel-case-expansion': false,
        });
    }
    getArgv(arg){
        return this.yargs.argv[arg];
    }
    showHelp(){
        return this.yargs.showHelp();
    }
}

export default Args;
