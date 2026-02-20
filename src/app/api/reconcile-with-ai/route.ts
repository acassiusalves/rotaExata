import { NextResponse } from "next/server";
import { analyzePaymentReceipt } from "@/ai/flows/analyze-payment-receipt";
import { rateLimit, rateLimitConfigs, getClientIP, rateLimitHeaders } from '@/lib/rate-limit';
import { logBankReconciliation } from '@/lib/firebase/activity-log';

// Tolerância de valor para conciliação automática (em reais)
const VALUE_TOLERANCE = 0.50;

type ReconciliationItem = {
  routeId: string;
  stopIndex: number;
  expectedValue: number;
  photoUrl: string;
  customerName?: string;
};

type ReconciliationResult = {
  routeId: string;
  stopIndex: number;
  customerName?: string;
  expectedValue: number;
  extractedValue: number;
  success: boolean;
  reconciled: boolean;
  difference: number;
  error?: string;
};

/**
 * Generates a JWT for Firebase Authentication using service account credentials
 */
async function generateFirebaseJWT(): Promise<string> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase credentials');
  }

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const crypto = await import('crypto');
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();
  const signature = sign.sign(formattedKey, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Exchanges JWT for an access token
 */
async function getAccessToken(): Promise<string> {
  const jwt = await generateFirebaseJWT();

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Gets a route document from Firestore
 */
async function getRouteFromFirestore(routeId: string, accessToken: string): Promise<any> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/routes/${routeId}`;

  const response = await fetch(firestoreUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get route: ${error}`);
  }

  return response.json();
}

/**
 * Updates a route document in Firestore
 */
async function updateRouteInFirestore(routeId: string, stops: any[], accessToken: string): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/routes/${routeId}?updateMask.fieldPaths=stops`;

  // Convert stops array to Firestore format
  const stopsValue = {
    arrayValue: {
      values: stops.map((stop: any) => ({
        mapValue: {
          fields: Object.entries(stop).reduce((acc: any, [key, value]) => {
            if (value === undefined || value === null) return acc;

            if (typeof value === 'string') {
              acc[key] = { stringValue: value };
            } else if (typeof value === 'number') {
              acc[key] = { doubleValue: value };
            } else if (typeof value === 'boolean') {
              acc[key] = { booleanValue: value };
            } else if (Array.isArray(value)) {
              acc[key] = {
                arrayValue: {
                  values: value.map((item: any) => {
                    if (typeof item === 'object') {
                      return {
                        mapValue: {
                          fields: Object.entries(item).reduce((itemAcc: any, [itemKey, itemValue]) => {
                            if (itemValue === undefined || itemValue === null) return itemAcc;
                            if (typeof itemValue === 'string') {
                              itemAcc[itemKey] = { stringValue: itemValue };
                            } else if (typeof itemValue === 'number') {
                              itemAcc[itemKey] = { doubleValue: itemValue };
                            } else if (typeof itemValue === 'boolean') {
                              itemAcc[itemKey] = { booleanValue: itemValue };
                            }
                            return itemAcc;
                          }, {})
                        }
                      };
                    }
                    return { stringValue: String(item) };
                  })
                }
              };
            } else if (typeof value === 'object' && value !== null) {
              // Handle timestamp objects
              if ('_seconds' in value || 'seconds' in value) {
                const seconds = value._seconds || value.seconds;
                acc[key] = { timestampValue: new Date(seconds * 1000).toISOString() };
              }
            }
            return acc;
          }, {})
        }
      }))
    }
  };

  const response = await fetch(firestoreUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        stops: stopsValue
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update route: ${error}`);
  }
}

/**
 * Parse Firestore document to plain object
 */
function parseFirestoreValue(value: any): any {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue);
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return { _seconds: Math.floor(new Date(value.timestampValue).getTime() / 1000) };
  if (value.arrayValue) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  if (value.mapValue) {
    const result: any = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      result[k] = parseFirestoreValue(v);
    }
    return result;
  }
  return null;
}

function parseFirestoreDocument(doc: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    result[key] = parseFirestoreValue(value);
  }
  return result;
}

export async function POST(req: Request) {
  try {
    // Rate limiting (mais restritivo para AI - consome mais recursos)
    const clientIP = getClientIP(req);
    const rateLimitResult = rateLimit(clientIP, rateLimitConfigs.write);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", detail: "Muitas requisições. Tente novamente em alguns segundos." },
        { status: 429, headers: rateLimitHeaders(rateLimitResult) }
      );
    }

    const { items } = await req.json() as { items: ReconciliationItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({
        error: "INVALID_INPUT",
        detail: "É necessário fornecer uma lista de itens para conciliar."
      }, { status: 400 });
    }

    // Limit batch size to prevent timeout
    if (items.length > 10) {
      return NextResponse.json({
        error: "BATCH_TOO_LARGE",
        detail: "Máximo de 10 itens por lote. Por favor, divida em lotes menores."
      }, { status: 400 });
    }

    const accessToken = await getAccessToken();
    const results: ReconciliationResult[] = [];

    // Group items by routeId to minimize Firestore reads
    const itemsByRoute: Map<string, ReconciliationItem[]> = new Map();
    for (const item of items) {
      const existing = itemsByRoute.get(item.routeId) || [];
      existing.push(item);
      itemsByRoute.set(item.routeId, existing);
    }

    // Process each route
    for (const [routeId, routeItems] of itemsByRoute) {
      try {
        // Get route document
        const routeDoc = await getRouteFromFirestore(routeId, accessToken);
        const routeData = parseFirestoreDocument(routeDoc);
        const stops = routeData.stops || [];

        let routeUpdated = false;

        // Process each item in this route
        for (const item of routeItems) {
          const result: ReconciliationResult = {
            routeId: item.routeId,
            stopIndex: item.stopIndex,
            customerName: item.customerName,
            expectedValue: item.expectedValue,
            extractedValue: 0,
            success: false,
            reconciled: false,
            difference: 0,
          };

          try {
            // Call AI to analyze the receipt
            const aiResult = await analyzePaymentReceipt({ imageUrl: item.photoUrl });

            result.extractedValue = aiResult.extractedValue;
            result.success = aiResult.success;

            if (!aiResult.success) {
              result.error = aiResult.error || 'IA não conseguiu extrair o valor do comprovante';
              results.push(result);
              continue;
            }

            // Calculate difference
            result.difference = Math.abs(aiResult.extractedValue - item.expectedValue);

            // Check if values match within tolerance
            if (result.difference <= VALUE_TOLERANCE) {
              result.reconciled = true;

              // Update the stop in the route
              if (stops[item.stopIndex]) {
                stops[item.stopIndex].reconciled = true;
                stops[item.stopIndex].reconciledAt = { _seconds: Math.floor(Date.now() / 1000) };
                stops[item.stopIndex].reconciledBy = 'ai-system';
                stops[item.stopIndex].reconciledMethod = 'ai';
                stops[item.stopIndex].aiExtractedValue = aiResult.extractedValue;
                routeUpdated = true;

                // Registra a conciliação automática no log de atividades
                await logBankReconciliation({
                  userId: 'ai-system',
                  userName: 'Sistema IA',
                  routeId: item.routeId,
                  routeCode: routeData.code || 'N/A',
                  pointId: stops[item.stopIndex].id,
                  pointCode: stops[item.stopIndex].pointCode,
                  customerName: item.customerName,
                  expectedValue: item.expectedValue,
                  extractedValue: aiResult.extractedValue,
                  reconciledMethod: 'ai',
                  photoUrl: item.photoUrl,
                  difference: result.difference,
                }).catch(logError => {
                  // Não propaga erro de logging para não quebrar conciliação
                  console.error('[Reconciliation] Erro ao registrar log:', logError);
                });
              }
            } else {
              result.error = `Diferença de R$ ${result.difference.toFixed(2)} excede tolerância de R$ ${VALUE_TOLERANCE.toFixed(2)}`;
            }

          } catch (itemError: any) {
            result.error = itemError?.message || 'Erro ao processar item';
          }

          results.push(result);
        }

        // Save updates to Firestore if any changes were made
        if (routeUpdated) {
          await updateRouteInFirestore(routeId, stops, accessToken);
        }

      } catch (routeError: any) {
        // Add error results for all items in this route
        for (const item of routeItems) {
          results.push({
            routeId: item.routeId,
            stopIndex: item.stopIndex,
            customerName: item.customerName,
            expectedValue: item.expectedValue,
            extractedValue: 0,
            success: false,
            reconciled: false,
            difference: 0,
            error: `Erro ao processar rota: ${routeError?.message}`,
          });
        }
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      reconciled: results.filter(r => r.reconciled).length,
      failed: results.filter(r => !r.reconciled).length,
      aiErrors: results.filter(r => !r.success).length,
      valueMismatch: results.filter(r => r.success && !r.reconciled).length,
    };

    return NextResponse.json({
      success: true,
      summary,
      results
    });

  } catch (e: any) {
    console.error("Failed to process reconciliation:", e);
    return NextResponse.json({
      error: "SERVER_ERROR",
      detail: e?.message || "Erro desconhecido ao processar conciliação."
    }, { status: 500 });
  }
}
