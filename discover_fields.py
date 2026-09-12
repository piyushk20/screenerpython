"""Discover all timeframe-aware field names and new indicator fields."""
import sys, re
sys.path.insert(0, '.')
from tvscreener import StockField

print("=== STOCHASTIC fields ===")
stoch = [n for n in dir(StockField) if 'STOCH' in n and 'RSI' not in n]
print(stoch[:20])

print("\n=== WILLIAMS %R ===")
wills = [n for n in dir(StockField) if 'WILLIAMS' in n or 'W_R' in n or 'WILLIAM' in n]
print(wills[:15])

print("\n=== CCI fields ===")
cci = [n for n in dir(StockField) if 'CCI' in n]
print(cci[:15])

print("\n=== MFI fields ===")
mfi = [n for n in dir(StockField) if 'MFI' in n or 'MONEY_FLOW' in n]
print(mfi[:15])

print("\n=== OBV fields ===")
obv = [n for n in dir(StockField) if 'OBV' in n or 'ON_BALANCE' in n]
print(obv[:10])

print("\n=== ICHIMOKU fields ===")
ichi = [n for n in dir(StockField) if 'ICHIMOKU' in n]
print(ichi[:15])

print("\n=== PARABOLIC SAR ===")
psar = [n for n in dir(StockField) if 'PARABOLIC' in n or 'PSAR' in n or 'SAR' == n]
print(psar[:10])

print("\n=== ROC / Rate of Change ===")
roc = [n for n in dir(StockField) if 'ROC' in n or 'RATE_OF_CHANGE' in n]
print(roc[:10])

print("\n=== HullMA / Hull ===")
hull = [n for n in dir(StockField) if 'HULL' in n or 'HMA' in n]
print(hull[:10])

print("\n=== RECOMMEND / SIGNALS ===")
rec = [n for n in dir(StockField) if 'REC' in n or 'RECOMMEND' in n]
print(rec[:20])

print("\n=== RSI on timeframes (check suffix pattern) ===")
# RSI14 across timeframes
rsi14_tf = [n for n in dir(StockField) if n == 'RELATIVE_STRENGTH_INDEX_14' or re.match(r'^RSI_\d', n) or re.match(r'^RSI_1[WM]$', n)]
print(sorted(rsi14_tf)[:20])

print("\n=== EMA20 across timeframes ===")
ema20_tf = [n for n in dir(StockField) if re.match(r'^EMA20', n)]
print(sorted(ema20_tf))

print("\n=== MACD across timeframes ===")
macd_tf = [n for n in dir(StockField) if re.match(r'^MACD_LEVEL', n) or re.match(r'^MACD_MACD', n)]
print(sorted(macd_tf)[:20])

print("\n=== ADX across timeframes ===")
adx_tf = [n for n in dir(StockField) if re.match(r'^ADX_\d+$', n) or n == 'ADX']
print(sorted(adx_tf)[:20])

print("\n=== VWAP across timeframes ===")
vwap_tf = [n for n in dir(StockField) if n.startswith('VWAP')]
print(sorted(vwap_tf))

print("\n=== ATR daily ===")
atr_tf = [n for n in dir(StockField) if re.match(r'^ATR_\d+$', n) or n == 'ATR']
print(sorted(atr_tf)[:15])

print("\n=== SMA 20 across timeframes ===")
sma20_tf = [n for n in dir(StockField) if re.match(r'^SMA20', n)]
print(sorted(sma20_tf))

print("\n=== BB upper/lower across timeframes ===")
bb_tf = [n for n in dir(StockField) if 'BOLLINGER' in n]
print(sorted(bb_tf)[:20])
