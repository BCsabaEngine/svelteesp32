# Change log

## 1.5

### 1.5.1

- bugfix: It generated an error code if there was an @ sign in the file name. We tried to protect all possible characters: `!&()+./@{}~-`

### 1.5.0

- New engine type (-e psychic2) for PsychicHttp v2

- Run tests with github repos instead of packages

## 1.4

### 1.4.1

- Implemented a new function to **identify and log files with identical content**.

- Added support for multiple linting tools to ensure higher code standards.

### 1.4.0

- Breaking change: --no-gzip changed to --gzip

- The etag and gzip compiler option: For Etag and Gzip switches, values ​​true|false|compiler can be used. In the case of a compiler value, both variants can be found in the .h file and you can decide at compile time which one should be used.

- The created and version info: You can put the creation date and a version number in the .h file with the --created and --version options.

- 2x9 build and test system: We also run all possible parameter combinations (etag and gzip) for the Async and Psychic web servers.

- Separated demo env

- Proper svelte demo app

- Create output directory: If output folder not exists, it will be automatically created

- Detect precompressed files: If a.b and a.b.gz exist together, the .gz file is not used (gz, br, brottli)

- Reduce .h file size: The size of the .h file has been reduced by 35-50%.

- Skip gz under 1024: The gzip threshold increased to 1024 bytes.

- Pipeline node version update

- Warning if not usable directive used

- Colored console

## 1.3

### 1.3.1

- Filename directives are uppercased

- Filecount by extension

### 1.3.0

- C++ defines can be used

- C++ defines group by filetypes: Should we be able to check if a given file name or number of files is correct? For this, we should find C++ defines in the generated code.

## 1.2

### 1.2.4

- Deps update

### 1.2.2

- Necessary C++ includes

### 1.2.1

- Windows paths

### 1.2.0

- ESP8266/ESP8285 is also supported

## 1.1

### 1.1.0

- ETag available
