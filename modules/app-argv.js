import * as YargsInit from 'yargs';

class Args {
    constructor(config, reqArgs = []){
        if(typeof config.accounts !== 'object' || Array.isArray(config.accounts) && config.accounts === null){
            config.accounts = {
                empty: '',
            };
        }
        this.accounts = Object.keys(config.accounts);
        this.remote_dir = config.remote_dir;
        this.yargs = YargsInit.default(process.argv);
        // set parsing defaults
        this.yargs.parserConfiguration({
            'duplicate-arguments-array': false,
            'camel-case-expansion': false,
            'boolean-negation': false,
        });
        // set help defaults
        this.yargs.wrap(Math.min(120));
        this.yargs.usage('Usage: $0 [options]');
        this.yargs.version(false);
        // set options
        const yargsOpts = {};
        for(const a of reqArgs){
            switch(a) {
                case 'a':
                    yargsOpts[a] = {
                        alias: ['acc'],
                        describe: 'Use Account ID',
                        choices: Object.keys(config.accounts || []),
                        type: 'string',
                    };
                    break;
                case 'l':
                    yargsOpts[a] = {
                        alias: ['local'],
                        describe: 'Select Local Path',
                        type: 'string',
                    };
                    break;
                case 'r':
                    yargsOpts[a] = {
                        alias: ['remote'],
                        describe: 'Select Remote Path',
                        type: 'string',
                    };
                    break;
                case 's':
                    yargsOpts[a] = {
                        alias: ['surl', 'sharelink'],
                        describe: 'Input Sharable Link',
                        type: 'string',
                    };
                    break;
                case 'no-rapidupload':
                    yargsOpts[a] = {
                        describe: 'Skip Rapid Upload',
                        type: 'boolean',
                    };
                    break;
                case 'skip-chunks':
                    yargsOpts[a] = {
                        describe: 'Generate .tbhash without chunks hash',
                        type: 'boolean',
                    };
                    break;
            }
        }
        
        yargsOpts['h'] = {
            alias: ['help'],
            describe: 'Show help',
            type: 'boolean',
        };
        
        this.yargs.options(yargsOpts);
    }
    getArgv(arg){
        return this.yargs.argv[arg];
    }
    showHelp(){
        return this.yargs.showHelp();
    }
}

export default Args;
