# ATF-chrome-plugin
Definition and implementation (as a Chrome plugin) of approximate Above-the-Fold (ATF) metrics for Web performance evaluation 


## Installation
For MAC and Linux users:
1. Download the extension using git clone. 
2. Open a Chrome tab and go to "chrome://extension".
3. Enable "Developer mode" and click on "Load unpacked extension"
4. Select the "ATF-chrome-plugin" folder and click on "Open"

For Windows users:
It is unfortunately very unconvenient to run the instructions above on Windows. For more information, check:
https://stackoverflow.com/questions/24577024/install-chrome-extension-not-in-the-store

## Usage
The plugin runs on every page and triggers after the "onload" event. Just open the Chrome console to view 
the Web performance metrics calculated by the plugin. 

![Image of plugin in action](https://github.com/TeamRossi/ATF-chrome-plugin/raw/master/Plugin-example.png "Image of plugin in action")

## More info
For more insights on the metrics,  technical details,  scientific studies, datasets etc. visit our project page: https://newnet.telecom-paristech.fr/index.php/webqoe/

