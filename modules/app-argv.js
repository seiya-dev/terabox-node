import * as YargsInit from 'yargs';

class Args {
    constructor(config, reqArgs = []){
        this.accounts = Object.keys(config.accounts);
        this.remote_dir = config.remote_dir;
        this.yargs = YargsInit.default(process.argv);
        // set parsing defaults
        this.yargs.parserConfiguration({
            'duplicate-arguments-array': false,
            'camel-case-expansion': false,
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
                        describe: 'Select Local Dir',
                        type: 'string',
                    };
                    break;
                case 'r':
                    yargsOpts[a] = {
                        alias: ['remote'],
                        describe: 'Select Remote Dir',
                        type: 'string',
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
