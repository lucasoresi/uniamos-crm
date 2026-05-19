#include <stdio.h>
#include <stdlib.h>

typedef struct Lista {
    int codigoVenta;
    int cantidadProductosVendidos;
    float precioUnitarioCadaVenta;
    struct Lista *siguiente;
} Nodo;

// ─── CARGAR ───────────────────────────────────────────────
void cargar(Nodo *registro) {
    printf("Ingrese codigo de venta (0 para terminar): ");
    scanf("%d", &registro->codigoVenta);
    if (registro->codigoVenta == 0) {
        registro->siguiente = NULL;
    } else {
        printf("Ingrese cantidad de productos vendidos: ");
        scanf("%d", &registro->cantidadProductosVendidos);
        printf("Ingrese precio unitario: ");
        scanf("%f", &registro->precioUnitarioCadaVenta);
        registro->siguiente = (Nodo*)malloc(sizeof(Nodo));
        cargar(registro->siguiente);
    }
}

// ─── PUNTO 1: MOSTRAR LISTA ORIGINAL ─────────────────────
void mostrar(Nodo *registro) {
    if (registro->siguiente != NULL) {
        printf("Cod: %d | Cantidad: %d | Precio: %.2f | Importe: %.2f\n",
            registro->codigoVenta,
            registro->cantidadProductosVendidos,
            registro->precioUnitarioCadaVenta,
            registro->cantidadProductosVendidos * registro->precioUnitarioCadaVenta);
        mostrar(registro->siguiente);
    }
}

// ─── PUNTO 2: MAYOR IMPORTE ──────────────────────────────
float importeMaximo(Nodo *registro, float max) {
    if (registro->siguiente == NULL) return max;
    float importe = registro->cantidadProductosVendidos * registro->precioUnitarioCadaVenta;
    if (importe > max) max = importe;
    return importeMaximo(registro->siguiente, max);
}

void mostrarMaximos(Nodo *registro, float max) {
    if (registro->siguiente == NULL) return;
    float importe = registro->cantidadProductosVendidos * registro->precioUnitarioCadaVenta;
    if (importe == max) {
        printf("Codigo: %d | Importe: %.2f\n", registro->codigoVenta, importe);
    }
    mostrarMaximos(registro->siguiente, max);
}

// ─── PUNTO 3: PROMEDIO + ELIMINAR + LISTA ELIMINADOS ─────
void calcularPromedio(Nodo *registro, float *suma, int *cantidad) {
    if (registro->siguiente == NULL) return;
    *suma += registro->cantidadProductosVendidos * registro->precioUnitarioCadaVenta;
    *cantidad += 1;
    calcularPromedio(registro->siguiente, suma, cantidad);
}

// elimina de la lista original los menores al promedio
// y los agrega a la lista de eliminados
Nodo* eliminarMenores(Nodo *registro, float promedio, Nodo *eliminados) {
    if (registro->siguiente == NULL) {
        eliminados->siguiente = NULL;
        return registro;
    }

    float importe = registro->cantidadProductosVendidos * registro->precioUnitarioCadaVenta;

    if (importe < promedio) {
        // copiar al nodo eliminados
        eliminados->codigoVenta = registro->codigoVenta;
        eliminados->cantidadProductosVendidos = registro->cantidadProductosVendidos;
        eliminados->precioUnitarioCadaVenta = registro->precioUnitarioCadaVenta;
        eliminados->siguiente = (Nodo*)malloc(sizeof(Nodo));

        Nodo *siguiente = registro->siguiente;
        free(registro);
        return eliminarMenores(siguiente, promedio, eliminados->siguiente);
    } else {
        registro->siguiente = eliminarMenores(registro->siguiente, promedio, eliminados);
        return registro;
    }
}

// ─── PUNTO 4: NUEVA LISTA CON CODIGO E IMPORTE ───────────
typedef struct ListaImporte {
    int codigoVenta;
    float importe;
    struct ListaImporte *siguiente;
} NodoImporte;

void generarListaImporte(Nodo *registro, NodoImporte *nuevo) {
    if (registro->siguiente == NULL) {
        nuevo->siguiente = NULL;
        return;
    }
    nuevo->codigoVenta = registro->codigoVenta;
    nuevo->importe = registro->cantidadProductosVendidos * registro->precioUnitarioCadaVenta;
    nuevo->siguiente = (NodoImporte*)malloc(sizeof(NodoImporte));
    generarListaImporte(registro->siguiente, nuevo->siguiente);
}

void mostrarImportes(NodoImporte *registro) {
    if (registro->siguiente != NULL) {
        printf("Cod: %d | Importe: %.2f\n", registro->codigoVenta, registro->importe);
        mostrarImportes(registro->siguiente);
    }
}

// ─── PUNTO 5: INSERTAR NODO DESPUES DE IMPORTE > 1.000.000 ──
void insertarNodoEspecial(NodoImporte *registro) {
    if (registro->siguiente == NULL) return;

    if (registro->importe > 1000000) {
        NodoImporte *aux = (NodoImporte*)malloc(sizeof(NodoImporte));
        aux->codigoVenta = -2;
        aux->importe = 0;
        aux->siguiente = registro->siguiente;
        registro->siguiente = aux;
        insertarNodoEspecial(aux->siguiente);  // saltar el nodo recién insertado
    } else {
        insertarNodoEspecial(registro->siguiente);
    }
}

// ─── PUNTO 6: INSERTAR EN POSICION N/3 ───────────────────
int contarNodos(Nodo *registro) {
    if (registro->siguiente == NULL) return 0;
    return 1 + contarNodos(registro->siguiente);
}

void sumarCantidades(Nodo *registro, int *suma) {
    if (registro->siguiente == NULL) return;
    *suma += registro->cantidadProductosVendidos;
    sumarCantidades(registro->siguiente, suma);
}

void sumarPrecios(Nodo *registro, float *suma) {
    if (registro->siguiente == NULL) return;
    *suma += registro->precioUnitarioCadaVenta;
    sumarPrecios(registro->siguiente, suma);
}

void insertarEnPosicion(Nodo *registro, int posicion, int sumaCantidades, float promPrecios) {
    if (registro->siguiente == NULL) return;
    if (posicion == 1) {
        Nodo *aux = (Nodo*)malloc(sizeof(Nodo));
        aux->codigoVenta = -1;
        aux->cantidadProductosVendidos = sumaCantidades;
        aux->precioUnitarioCadaVenta = promPrecios;
        aux->siguiente = registro->siguiente;
        registro->siguiente = aux;
        return;
    }
    insertarEnPosicion(registro->siguiente, posicion - 1, sumaCantidades, promPrecios);
}

// ─── MAIN ─────────────────────────────────────────────────
int main() {
    Nodo *head = (Nodo*)malloc(sizeof(Nodo));
    cargar(head);

    // Punto 1
    printf("\n--- Lista original ---\n");
    mostrar(head);

    // Punto 2
    float max = importeMaximo(head, 0);
    printf("\n--- Codigos con mayor importe ---\n");
    mostrarMaximos(head, max);

    // Punto 3
    float sumaImportes = 0;
    int cantidadNodos = 0;
    calcularPromedio(head, &sumaImportes, &cantidadNodos);
    float prom = sumaImportes / cantidadNodos;
    printf("\nPromedio de importes: %.2f\n", prom);

    Nodo *eliminados = (Nodo*)malloc(sizeof(Nodo));
    head = eliminarMenores(head, prom, eliminados);

    printf("\n--- Lista original sin menores al promedio ---\n");
    mostrar(head);

    printf("\n--- Lista de eliminados ---\n");
    mostrar(eliminados);

    // Punto 4
    NodoImporte *listaImporte = (NodoImporte*)malloc(sizeof(NodoImporte));
    generarListaImporte(head, listaImporte);
    printf("\n--- Lista con codigo e importe ---\n");
    mostrarImportes(listaImporte);

    // Punto 5
    insertarNodoEspecial(listaImporte);
    printf("\n--- Lista con nodos especiales insertados ---\n");
    mostrarImportes(listaImporte);

    // Punto 6
    int n = contarNodos(head);
    int posicion = n / 3;
    int sumaCant = 0;
    float sumaPrec = 0;
    sumarCantidades(head, &sumaCant);
    sumarPrecios(head, &sumaPrec);
    float promPrecios = sumaPrec / n;

    insertarEnPosicion(head, posicion, sumaCant, promPrecios);
    printf("\n--- Lista original con nodo en posicion N/3 ---\n");
    mostrar(head);

    return 0;
}