#! /bin/bash

set -e

SCRIPT_DIR=$(cd $(dirname ${BASH_SOURCE[0]}); pwd)
cd $SCRIPT_DIR


rm -f /tmp/sr_top500_banlist_ad.conf
wget -qq --output-document=/tmp/sr_top500_banlist_ad.conf https://johnshall.github.io/Shadowrocket-ADBlock-Rules-Forever/sr_top500_banlist_ad.conf

# reject
echo '# https://johnshall.github.io/Shadowrocket-ADBlock-Rules-Forever/sr_top500_banlist_ad.conf' > sr_top500_banlist_ad.reject.list

cat /tmp/sr_top500_banlist_ad.conf | grep -ioP '^[DUI][^\r\n]+,reject($|#| )' >> sr_top500_banlist_ad.reject.list

sed -i 's/,reject$//gi' sr_top500_banlist_ad.reject.list


# proxy
echo '# https://johnshall.github.io/Shadowrocket-ADBlock-Rules-Forever/sr_top500_banlist_ad.conf' > sr_top500_banlist_ad.proxy.list

cat /tmp/sr_top500_banlist_ad.conf | grep -ioP '^[DUI][^\r\n]+,proxy($|#| )' >> sr_top500_banlist_ad.proxy.list

sed -i 's/,proxy$//gi' sr_top500_banlist_ad.proxy.list

