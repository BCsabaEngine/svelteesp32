import { parse } from 'ts-command-line-args';

interface ICopyFilesArguments {
    sveltePath: string;
    espFile: string;
    help?: boolean;
}

export const args = parse<ICopyFilesArguments>(
    {
        sveltePath: { type: String, alias: 's', description: 'Svelte dist folder contains compiled files' },
        espFile: { type: String, alias: 'e', description: 'Generated file/path (default dist/svelteesp32.h)', defaultValue: 'svelteesp32.h' },
        help: { type: Boolean, optional: true, alias: 'h', description: 'Shows this help' },
    },
    {
        helpArg: 'help',
        headerContentSections: [{ header: 'svelteesp32', content: 'Svelte JS to ESP32 converter' }],
    },
);

console.log(args.espFile);
