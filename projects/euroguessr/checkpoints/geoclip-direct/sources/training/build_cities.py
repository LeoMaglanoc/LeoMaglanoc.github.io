"""Generate the offline Natural Earth city subset; no map network requests at runtime."""
import io,json,zipfile,hashlib,argparse
from pathlib import Path
import shapefile
from train import ROOT
from prepare import COUNTRIES
URL='https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip'
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=ROOT/'artifacts/geoclip-overnight/populated-places.zip');args=p.parse_args()
    raw=args.source.read_bytes(); archive=zipfile.ZipFile(io.BytesIO(raw))
    reader=shapefile.Reader(shp=io.BytesIO(archive.read('ne_10m_populated_places.shp')),shx=io.BytesIO(archive.read('ne_10m_populated_places.shx')),dbf=io.BytesIO(archive.read('ne_10m_populated_places.dbf')),encoding='utf-8')
    cities=[]
    for record in reader.records():
        r=record.as_dict();lat=float(r['LATITUDE']);lon=float(r['LONGITUDE'])
        if not (34<=lat<=72 and -25<=lon<=45 and r['ISO_A2'] in COUNTRIES): continue
        capital=r['FEATURECLA']=='Admin-0 capital'; rank=int(r['SCALERANK']); population=int(r['POP_MAX'])
        if not (capital or rank<=4 or population>=300000): continue
        cities.append({'name':r['NAME'],'lat':round(lat,5),'lon':round(lon,5),'country':r['ISO_A2'],'capital':capital,'population':population,'rank':rank,'tier':1 if capital and rank<=3 or population>=2500000 else 2 if capital or population>=1000000 else 3})
    cities.sort(key=lambda r:(r['tier'],not r['capital'],r['rank'],-r['population'],r['name']))
    cities=cities[:100]
    (ROOT/'cities.json').write_text(json.dumps({'source':URL,'version':'5.1.2','license':'public domain','source_sha256':hashlib.sha256(raw).hexdigest(),'selection':'Europe bounds and country allowlist; capitals or scale rank <=4 or population >=300000; 100 by tier/capital/scale/population','cities':cities},ensure_ascii=False,separators=(',',':'))+'\n')
    print(len(cities),[c['name'] for c in cities])
if __name__=='__main__':main()
